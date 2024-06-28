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

// MongoDB connection
mongoose
  .connect(
    "MONGO_URI"
  )
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("Error connecting to MongoDB:", err));

// User model
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

// Function to get the first GA4 property ID
async function getFirstPropertyId(authClient) {
  const analyticsAdmin = new AnalyticsAdminServiceClient({
   keyFile:'credentials.json'
  });

  try {
    console.log("Fetching GA4 properties...");
     const [properties] = await analyticsAdmin.listProperties({
       filter: "parent:properties/-",
     });
    console.log("Properties:", properties);

    if (properties && properties.length > 0) {
      const propertyId = properties[0].name.split("/")[1];
      console.log("First Property ID:", propertyId);
      return propertyId;
    } else {
      console.log("No properties found");
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

// Analytics data route
app.get("/analytics/:userId", async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);

    if (!user) {
      return res.status(400).send({ message: "User not found" });
    }

    if (!user.propertyId) {
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
      auth: oauth2Client,
    });

    const [response] = await analyticsDataClient.runReport({
      property: `properties/${user.propertyId}`,
      dateRanges: [
        {
          startDate: "7daysAgo",
          endDate: "today",
        },
      ],
      dimensions: [
        {
          name: "date",
        },
      ],
      metrics: [
        {
          name: "activeUsers",
        },
        {
          name: "screenPageViews",
        },
        {
          name: "sessions",
        },
      ],
    });

    const formattedData = response.rows.map((row) => ({
      date: row.dimensionValues[0].value,
      activeUsers: parseInt(row.metricValues[0].value),
      pageviews: parseInt(row.metricValues[1].value),
      sessions: parseInt(row.metricValues[2].value),
    }));

    res.json(formattedData);
  } catch (error) {
    console.error("Error in /analytics/:userId route:", error);
    res.status(500).send({
      message: "Error retrieving analytics data",
      error: error.message,
    });
  }
});

// User details route
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

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
