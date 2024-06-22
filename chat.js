const fs = require("fs").promises;
const { GoogleGenerativeAI } = require("@google/generative-ai");
const stringSimilarity = require("string-similarity");
const readline = require("readline");

const GEMINI_API_KEY = "env";
const TRANSCRIPTS_FILE_PATH = "./monk_data.json";

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

let transcripts = [];

async function readTranscripts() {
  try {
    const data = await fs.readFile(TRANSCRIPTS_FILE_PATH, "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Error reading transcripts file:", error.message);
    throw error;
  }
}

function findBestMatchingTranscript(query) {
  const { bestMatchIndex, bestMatch } = transcripts.reduce(
    (best, current, index) => {
      // Compare h2_text, url, and p_text for best match
      const textsToCompare = [current.h2_text, current.url, current.p_text];
      const ratings = textsToCompare.map((text) =>
        stringSimilarity.compareTwoStrings(query, text)
      );
      const maxRating = Math.max(...ratings);

      if (maxRating > best.bestMatch.rating) {
        return {
          bestMatchIndex: index,
          bestMatch: {
            target: textsToCompare[ratings.indexOf(maxRating)],
            rating: maxRating,
          },
        };
      } else {
        return best;
      }
    },
    { bestMatchIndex: -1, bestMatch: { rating: -Infinity } }
  );

  if (bestMatch.rating < 0.3) {
    return null;
  }

  console.log(
    `Best match: "${bestMatch.target}" (similarity: ${bestMatch.rating.toFixed(
      2
    )})`
  );

  return transcripts[bestMatchIndex]; // Return the entire transcript object
}

async function getAnswerFromGemini(context, question) {
  try {
    const prompt = `Based on the insights answer the question below in a concise manner without leaving any point but in a summarized form:\n\n"${question}"\n\nContext:\n${context.p_text}`;
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error("Error getting answer from Gemini:", error.message);
    return "I'm sorry, I couldn't get an answer at this time.";
  }
}

async function chatbot() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(
    "Chatbot: Hello! I'm here to answer your questions about the transcripts. Type 'exit' to end the conversation."
  );

  while (true) {
    const question = await new Promise((resolve) => {
      rl.question("You: ", resolve);
    });

    if (question.toLowerCase() === "exit") {
      console.log("Chatbot: Goodbye! Have a great day!");
      rl.close();
      break;
    }

    const relevantTranscript = findBestMatchingTranscript(question);
    if (relevantTranscript) {
      const answer = await getAnswerFromGemini(relevantTranscript, question);
      console.log("Chatbot:", answer);
    } else {
      console.log(
        "Chatbot: I'm sorry, I couldn't find any relevant information to answer your question."
      );
    }
  }
}

async function main() {
  try {
    transcripts = await readTranscripts();
    await chatbot();
  } catch (error) {
    console.error("Main error:", error.message);
  }
}

main();
