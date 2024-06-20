const { google } = require("googleapis");

const youtube = google.youtube({
  version: "v3",
  auth: "ENV", 
});

async function getChannelId(channelName) {
  try {
    const response = await youtube.search.list({
      part: "id",
      type: "channel",
      q: channelName,
    });

    if (response.data.items && response.data.items.length > 0) {
      return response.data.items[0].id.channelId;
    } else {
      throw new Error("Channel not found");
    }
  } catch (error) {
    console.error("Error finding channel ID:", error.message);
    throw error;
  }
}

// In the main function:
async function main() {
  try {
    const channelName = "myfirstmillion"; // or 'myfirstmillion' if that's their custom URL
    console.log("Finding channel ID...");
    const channelId = await getChannelId(channelName);
    console.log(`Channel ID for "${channelName}": ${channelId}`);

    // console.log("Fetching videos...");
    // const videos = await getChannelVideos(channelId);
    // ... rest of the main function
  } catch (error) {
    console.error("An error occurred:", error);
  }
}

main();
