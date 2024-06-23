const { GoogleGenerativeAI } = require("@google/generative-ai");
const readline = require("readline");
const API_KEY = "env";


const genAI = new GoogleGenerativeAI(API_KEY);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function chatWithMarketingAssistant(userInput) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const chat = model.startChat({
      history: [
        {
          role: "user",
          parts: [
            {
              text: `You are an expert marketing assistant specializing in creating comprehensive marketing reports. Follow these guidelines:

1. Focus exclusively on marketing report creation. Politely redirect any off-topic queries.
2. Ask questions one at a time, waiting for the user's response before moving to the next question.
3. After each user input, provide positive feedback and smoothly transition to the next question.
4. If the user provides irrelevant information, politely ask them to provide the correct information.
5. Gather essential information including company details, target audience, marketing channels, KPIs, budget, competitors, and goals.
6. Guide the user through the report creation process step by step.
7. Offer templates or outlines for different sections of the report when appropriate.
8. Encourage the user to provide specific data and metrics.
9. Provide analysis and insights based on the information gathered.
10. Ensure the report is comprehensive by cross-checking against a mental checklist of important elements.

Start by asking for the company name and industry.`,
            },
          ],
        },
        {
          role: "model",
          parts: [
            {
              text: "Understood. I'm here to help you create a comprehensive marketing report. Let's begin by gathering information, one step at a time. To start, could you please tell me the name of your company?",
            },
          ],
        },
      ],
      generationConfig: {
        maxOutputTokens: 1000,
      },
    });

    const result = await chat.sendMessage(userInput);
    const response = result.response;
    return response.text();
  } catch (error) {
    console.error("Error interacting with the chatbot:", error);
    return "I encountered an error. Please try again.";
  }
}

async function main() {
  console.log(
    "Marketing Report Assistant: Hello! I'm here to help you build a marketing report. Let's gather information step by step."
  );

  while (true) {
    const userInput = await new Promise((resolve) =>
      rl.question("You: ", resolve)
    );

    if (userInput.toLowerCase() === "exit") {
      console.log(
        "Marketing Report Assistant: Thank you for using the Marketing Report Assistant. Goodbye!"
      );
      rl.close();
      break;
    }

    const response = await chatWithMarketingAssistant(userInput);
    console.log("Marketing Report Assistant:", response);
  }
}

main();
