import * as vscode from 'vscode';
import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { StructuredOutputParser } from 'langchain/output_parsers';
import { z } from 'zod';

// Zod schema for output parsing
const completionSchema = z.object({
    codeSnippet: z.string(),
    language: z.string(),
});

export async function fetchCompletion(prompt: string): Promise<string> {
    const outputParser = StructuredOutputParser.fromZodSchema(completionSchema);

    // Get model configuration from settings
    const config = vscode.workspace.getConfiguration("codeCompletion");
    const apiKey = config.get<string>("apiKey") || process.env.API_KEY;
    const provider = config.get<string>("provider") || process.env.PROVIDER;
    const modelName = config.get<string>("model") || process.env.MODEL_NAME;

    if (!apiKey) {
        vscode.window.showErrorMessage("API Key is missing.");
        return '';
    }

    if (!provider || !modelName) {
        vscode.window.showErrorMessage("Provider or Model is not selected.");
        return '';
    }

    try {
        let response: string;
        let model: any;

        if (provider === 'openai') {
            model = new ChatOpenAI({
                temperature: 0.5,
                openAIApiKey: apiKey,
                modelName: modelName,
            });

        } else if (provider === 'anthropic') {
            const model = new ChatAnthropic({
                temperature: 0.5,
                anthropicApiKey: apiKey,
                modelName: modelName,
            });

        } else {
            vscode.window.showErrorMessage("Unsupported provider. Please choose 'openai' or 'anthropic'.");
            return '';
        }

        // Invoke the model
        const completion = await model.invoke([
            { role: 'system', content: "You are a helpful code assistant." },
            {
                role: 'user',
                content: `${prompt}\nProvide the output in the following format: ${outputParser.getFormatInstructions()}`,
            },
        ]);
        response = completion.text;

        // Parse the output
        const parsedOutput = await outputParser.parse(response);
        return parsedOutput.codeSnippet.trim();

    } catch (error) {
        console.error('Error fetching completion:', error);
        vscode.window.showErrorMessage('Error generating completion. Check the console for details.');
        return '';
    }
}

export async function checkApiKeyValidity(apiKey: string, provider: string, modelName: string): Promise<boolean> {
    let model: any;
    try {
        if (provider === 'openai') {
            // Check validity by creating an instance of ChatOpenAI
            model = new ChatOpenAI({
                openAIApiKey: apiKey,
                modelName: modelName,
            });
        } else if (provider === 'anthropic') {
            // Check validity by creating an instance of ChatAnthropic
            model = new ChatAnthropic({
                anthropicApiKey: apiKey,
                modelName: 'claude-3-haiku-20240307',
            });
        } else {
            throw new Error("Unsupported provider.");
        }

        await model.invoke([{ role: 'user', content: 'Test prompt for validation.' }]);

        return true;

    } catch (error) {
        console.error('Error validating API key:', error);
        return false;
    }
}
