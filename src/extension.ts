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

// Predefine models
const predefinedModels: { openai: string[]; anthropic: string[] } = {
	openai: ["gpt-4o", "gpt-4o-mini", "gpt-1o-preview", "gpt-1o-mini"],
	anthropic: ["claude-3-5-sonnet-latest", "claude-3-5-haiku-latest", "claude-3-opus-latest"]
};

const outputParser = StructuredOutputParser.fromZodSchema(completionSchema);

async function fetchCompletion(prompt: string): Promise<string> {
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

async function checkApiKeyValidity(apiKey: string, provider: string, modelName: string): Promise<boolean> {
	try {
		if (provider === 'openai') {
			// Check validity by creating an instance of ChatOpenAI
			const model = new ChatOpenAI({
				openAIApiKey: apiKey,
				modelName: modelName,
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

async function selectModel(provider: "openai" | "anthropic"): Promise<string | undefined> {
	const config = vscode.workspace.getConfiguration("codeCompletion");
	const customModels = config.get<{ [key: string]: string[] }>("customModels") || {};

	const allModels = [
		...(predefinedModels[provider] || []), // Safe to index with `provider`
		...(customModels[provider] || []),
		"Add a Model..."
	];

	const selectedModel = await vscode.window.showQuickPick(allModels, {
		title: `Select a model for ${provider}`,
		placeHolder: "Choose a model or add a new one"
	});

	// Handle "Add a Model" option...
	if (selectedModel === "Add a Model...") {
		const newModel = await vscode.window.showInputBox({
			title: "Enter model name",
			prompt: "Provide the name of the new model",
			placeHolder: "e.g., my-custom-model",
			ignoreFocusOut: true
		});

		if (newModel) {
			const updatedCustomModels = { ...customModels };
			if (!updatedCustomModels[provider]) {
				updatedCustomModels[provider] = [];
			}
			updatedCustomModels[provider].push(newModel);
			await config.update("customModels", updatedCustomModels, vscode.ConfigurationTarget.Global);

			vscode.window.showInformationMessage(`Model '${newModel}' added for ${provider}.`);
			return newModel;
		}
	}

	return selectedModel;
}

export function activate(context: vscode.ExtensionContext) {

	// Completion provider command
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

	// Command to setup Null code suggestions
	const setupCommand = vscode.commands.registerCommand('codeCompletion.setup', async () => {
		const apiKey = await vscode.window.showInputBox({
			prompt: 'Enter your API Key',
			placeHolder: 'Your API Key...',
			ignoreFocusOut: true,
			password: true,
		});

		if (!apiKey) {
			vscode.window.showErrorMessage('API Key is required!');
			return;
		}

		const provider = await vscode.window.showQuickPick(['openai', 'anthropic'], {
			placeHolder: 'Select the provider (OpenAI or Anthropic)',
			ignoreFocusOut: true,
		});

		if (!provider) {
			vscode.window.showErrorMessage('Provider is required!');
			return;
		}

		// @ts-ignore
		const model = await selectModel(provider);

		if (!model) {
			vscode.window.showErrorMessage('Model selection is required!');
			return;
		}

		// Validate API Key
		const isValidApiKey = await checkApiKeyValidity(apiKey, provider, model);
		if (!isValidApiKey) {
			vscode.window.showErrorMessage('Invalid API Key or Model Name. Please check and try again.');
			return;
		}

		// Save Configurations
		await vscode.workspace.getConfiguration('codeCompletion').update('apiKey', apiKey, vscode.ConfigurationTarget.Global);
		await vscode.workspace.getConfiguration('codeCompletion').update('provider', provider, vscode.ConfigurationTarget.Global);
		await vscode.workspace.getConfiguration('codeCompletion').update('model', model, vscode.ConfigurationTarget.Global);

		vscode.window.showInformationMessage(`Setup complete with Provider: ${provider}, Model: ${model}.`);
	});

	context.subscriptions.push(setupCommand);
	context.subscriptions.push(completionProvider);

}

export function deactivate() { }
