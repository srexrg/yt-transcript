const { google } = require("googleapis");
const { YoutubeTranscript } = require("youtube-transcript");
const fs = require("fs").promises;
const path = require("path");

const youtube = google.youtube({
  version: "v3",
  auth: "ENV",
});

const channelId = "UCyaN6mg5u8Cjy2ZI4ikWaug";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getChannelVideos(channelId) {
  try {
    const res = await youtube.channels.list({
      id: channelId,
      part: "contentDetails",
    });

    const playlistId =
      res.data.items[0].contentDetails.relatedPlaylists.uploads;
    let videos = [];
    let nextPageToken = null;

    do {
      const res = await youtube.playlistItems.list({
        playlistId: playlistId,
        part: "snippet",
        maxResults: 50,
        pageToken: nextPageToken,
      });

      videos = videos.concat(res.data.items);
      nextPageToken = res.data.nextPageToken;

      await delay(3000);
    } while (nextPageToken);

    return videos;
  } catch (error) {
    console.error("Error fetching channel videos:", error.message);
    throw error;
  }
}

async function getTranscript(videoId) {
  try {
    const transcript = await YoutubeTranscript.fetchTranscript(videoId);
    return transcript.map((entry) => entry.text).join(" ");
  } catch (error) {
    console.error(
      `Error fetching transcript for video ${videoId}:`,
      error.message
    );
    return null;
  }
}

async function main() {
  try {
    console.log("Fetching videos...");
    const videos = await getChannelVideos(channelId);
    console.log(`Found ${videos.length} videos.`);

    const transcripts = [];

    for (const [index, video] of videos.entries()) {
      const videoId = video.snippet.resourceId.videoId;
      const title = video.snippet.title;

      console.log(`Processing video ${index + 1}/${videos.length}: ${title}`);

      const transcript = await getTranscript(videoId);

      if (transcript) {
        transcripts.push({
          videoId,
          title,
          transcript,
        });
        console.log(`Transcript fetched for: ${title}`);
      } else {
        console.log(`No transcript available for: ${title}`);
      }

      await delay(2000);
    }

    const outputPath = path.join(__dirname, "transcripts.json");
    await fs.writeFile(outputPath, JSON.stringify(transcripts, null, 2));
    console.log(`Transcripts saved to ${outputPath}`);
  } catch (error) {
    console.error("An error occurred:", error);
  }
}

main();


