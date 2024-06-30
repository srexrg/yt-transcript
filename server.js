const express = require("express");
const app = express();
const cors = require("cors");
const mongoose = require("mongoose");
const { OAuth2Client } = require("google-auth-library");
const { google } = require("googleapis");
const { BetaAnalyticsDataClient } = require("@google-analytics/data");
const { AnalyticsAdminServiceClient } = require("@google-analytics/admin");

const corsOptions = {
  origin: "http://localhost:5173",
  credentials: true,
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json());

mongoose
  .connect(
    "MONGO_URI"
  )
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("Error connecting to MongoDB:", err));

const User = mongoose.model(
  "User",
  new mongoose.Schema({
    googleId: String,
    propertyId: String,
    accessToken: String,
    refreshToken: String,
  })
);

// OAuth2 client setup
const oauth2Client = new OAuth2Client(
  "client_id",
  "client_secret",
  "redirect_uri"
);

async function getFirstPropertyId(authClient) {
  const analyticsAdmin = new AnalyticsAdminServiceClient({
   keyFile:'credentials.json'
  });

  try {
    console.log("Fetching GA4 accounts...");
    const [accounts] = await analyticsAdmin.listAccountSummaries();
    if (accounts && accounts.length > 0) {
      const accountId = accounts[0].account.split("/")[1];
      console.log("First Account ID:", accountId);

    console.log("Fetching GA4 properties...");
     const [properties] = await analyticsAdmin.listProperties({
        filter: `ancestor:accounts/${accountId}`,
     });
    console.log("Properties:", properties);

    if (properties && properties.length > 0) {
        const propertyId = properties[0].name.split("/")[1]; // Extract the property ID
      console.log("First Property ID:", propertyId);
      return propertyId;
    } else {
      console.log("No properties found");
      }
    } else {
      console.log("No accounts found");
    }
  } catch (error) {
    console.error("Error fetching property ID:", error);
  }

  console.log("No property ID found, returning null");
  return null;
}

app.get("/login", (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "profile",
      "email",
      "https://www.googleapis.com/auth/analytics.readonly",
      "https://www.googleapis.com/auth/analytics.edit",
    ],
  });
  res.redirect(authUrl);
});

app.get("/auth/google/callback", async (req, res) => {
  try {
    const { tokens } = await oauth2Client.getToken(req.query.code);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const { data } = await oauth2.userinfo.get();

    console.log("User info:", data);

    const propertyId = await getFirstPropertyId(oauth2Client);
    console.log("Retrieved property ID:", propertyId);

    let user = await User.findOne({ googleId: data.id });
    if (!user) {
      user = new User({
        googleId: data.id,
        propertyId: propertyId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
      });
      console.log("Creating new user");
    } else {
      user.propertyId = propertyId;
      user.accessToken = tokens.access_token;
      if (tokens.refresh_token) {
        user.refreshToken = tokens.refresh_token;
      }
      console.log("Updating existing user");
    }
    await user.save();
    console.log("User saved:", user);

    res.redirect(`http://localhost:5173/dashboard?userId=${user._id}`);
  } catch (error) {
    console.error("Error in /auth/google/callback:", error);
    res.status(500).send({ message: "Error authenticating" });
  }
});

app.post("/analytics/:userId", async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);

    if (!user) {
      return res.status(400).send({ message: "User not found" });
    }

    const { propertyId, dimensions, metrics } = req.body;

    if (!propertyId) {
      return res.status(400).send({
        message:
          "No Analytics property ID found for this user. Please ensure you have access to a Google Analytics 4 property.",
      });
    }

    oauth2Client.setCredentials({
      access_token: user.accessToken,
      refresh_token: user.refreshToken,
    });

    const analyticsDataClient = new BetaAnalyticsDataClient({
      authClient: oauth2Client,
    });

    const [metadataResponse] = await analyticsDataClient.getMetadata({
      name: `properties/${propertyId}/metadata`,
    });

    const availableDimensions = metadataResponse.dimensions.map((dim) => ({
      name: dim.apiName,
    }));
    const availableMetrics = metadataResponse.metrics.map((met) => ({
      name: met.apiName,
    }));

    //  console.log("Available dimensions:", availableDimensions);
    //  console.log("Available metrics:", availableMetrics);

    const dimensionObjects = dimensions.map((name) => ({ name }));
    const metricObjects = metrics.map((name) => ({ name }));

    const currentDate = new Date().toISOString().split("T")[0];

    console.log("Requesting data from GA4 with the following parameters:");
    console.log("Property ID:", propertyId);
    console.log("Date:", currentDate);
    console.log("Dimensions:", dimensions);
    console.log("Metrics:", metrics);

    const [response] = await analyticsDataClient.runReport({
      property: `properties/${propertyId}`,
      dimensions: dimensionObjects,
      metrics: metricObjects,
      dateRanges: [
        {
          startDate: "yesterday",
          endDate: "yesterday",
        },
      ],
    });

    console.log("Raw response from GA4:", JSON.stringify(response, null, 2));

    if (response.rowCount === 0) {
      return res
        .status(204)
        .send({ message: "No data available for the specified date range." });
    }

    const formattedData = response.rows.map((row) => {
      const formattedRow = {};
      row.dimensionValues.forEach((value, index) => {
        formattedRow[dimensionObjects[index].name] = value.value;
      });
      row.metricValues.forEach((value, index) => {
        formattedRow[metricObjects[index].name] = parseFloat(value.value);
      });
      return formattedRow;
    });

    console.log("Formatted data:", JSON.stringify(formattedData, null, 2));

    res.json(formattedData);
  } catch (error) {
    console.error("Error in /analytics/:userId route:", error);
    res.status(500).send({
      message: "Error retrieving analytics data",
      error: error.message,
    });
  }
});


app.get("/user/:userId", async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).send({ message: "User not found" });
    }
    res.json({
      googleId: user.googleId,
      propertyId: user.propertyId,
      hasAccessToken: !!user.accessToken,
      hasRefreshToken: !!user.refreshToken,
    });
  } catch (error) {
    console.error("Error fetching user details:", error);
    res.status(500).send({ message: "Error fetching user details" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
