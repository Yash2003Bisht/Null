import * as vscode from 'vscode';
import * as dotenv from 'dotenv';
import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { StructuredOutputParser } from 'langchain/output_parsers';
import { z } from 'zod';

dotenv.config();

// Zod schema for output parsing
const completionSchema = z.object({
	codeSnippet: z.string(),
	language: z.string(),
});

const outputParser = StructuredOutputParser.fromZodSchema(completionSchema);

async function fetchCompletion(prompt: string): Promise<string> {
	// Get model configuration from settings
	const apiKey = vscode.workspace.getConfiguration('codeCompletion').get<string>('apiKey') || process.env.API_KEY;
	const provider = vscode.workspace.getConfiguration('codeCompletion').get<string>('provider') || process.env.PROVIDER;

	if (!apiKey || !provider) {
		vscode.window.showErrorMessage("API Key or Provider is missing. Please configure settings.");
		return '';
	}

	try {
		let response: string;
		let model: any;

		if (provider === 'openai') {
			model = new ChatOpenAI({
				temperature: 0.5,
				openAIApiKey: apiKey,
				modelName: 'gpt-4o-mini',
			});

		} else if (provider === 'anthropic') {
			const model = new ChatAnthropic({
				temperature: 0.5,
				anthropicApiKey: apiKey,
				modelName: 'claude-3-haiku-20240307',
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

async function checkApiKeyValidity(apiKey: string, provider: string): Promise<boolean> {
	try {
		if (provider === 'openai') {
			// Check validity by creating an instance of ChatOpenAI
			const model = new ChatOpenAI({
				openAIApiKey: apiKey,
				modelName: 'gpt-4o-mini',
			});
			await model.invoke([{ role: 'user', content: 'Test prompt for validation.' }]);
		} else if (provider === 'anthropic') {
			// Check validity by creating an instance of ChatAnthropic
			const model = new ChatAnthropic({
				anthropicApiKey: apiKey,
				modelName: 'claude-3-haiku-20240307',
			});
			await model.invoke([{ role: 'user', content: 'Test prompt for validation.' }]);
		} else {
			throw new Error("Unsupported provider.");
		}
		return true;
	} catch (error) {
		console.error('Error validating API key:', error);
		return false;
	}
}

export function activate(context: vscode.ExtensionContext) {
	const completionProvider = vscode.languages.registerInlineCompletionItemProvider(
		{ scheme: 'file' },
		{
			async provideInlineCompletionItems(document, position, context, token) {
				const userInput = document.lineAt(position).text.substr(0, position.character);

				if (!userInput.trim()) {
					return { items: [] };
				}

				// Create the prompt
				const prompt = `
				You are a helpful coding assistant. Your task is to complete code snippets.
				The user has typed the following in ${document.languageId}:
	
				${userInput}
	
				Only complete the code from where the user's input ends. Do not repeat or duplicate the user's input.
				Provide the output as a string containing only the remaining part of the code.
	
				Completion starts after the input. Here's the input to complete:
				${userInput}
				`;

				const completionText = await fetchCompletion(prompt);

				if (!completionText) {
					return { items: [] };
				}

				const item = new vscode.InlineCompletionItem(completionText);
				item.range = new vscode.Range(position, position);

				return { items: [item] };
			},
		}
	);

	// Command to set the API key and provider
	const setApiKeyCommand = vscode.commands.registerCommand('codeCompletion.setApiKey', async () => {
		const apiKey = await vscode.window.showInputBox({
			prompt: 'Enter your API Key',
			placeHolder: 'Your API Key...',
			ignoreFocusOut: true,
			password: true,
		});

		const provider = await vscode.window.showQuickPick(['openai', 'anthropic'], {
			placeHolder: 'Select the provider (OpenAI or Anthropic)',
			ignoreFocusOut: true,
		});

		if (apiKey && provider) {
			const isValidApiKey = await checkApiKeyValidity(apiKey, provider);

			if (isValidApiKey) {
				await vscode.workspace.getConfiguration('codeCompletion').update('apiKey', apiKey, vscode.ConfigurationTarget.Global);
				await vscode.workspace.getConfiguration('codeCompletion').update('provider', provider, vscode.ConfigurationTarget.Global);
				vscode.window.showInformationMessage(`${provider} API Key saved successfully.`);
			} else {
				vscode.window.showErrorMessage('Invalid API Key. Please check and try again.');
			}
		} else {
			vscode.window.showErrorMessage('API Key and provider are required!');
		}
	});

	context.subscriptions.push(setApiKeyCommand);
	context.subscriptions.push(completionProvider);
}

export function deactivate() { }
