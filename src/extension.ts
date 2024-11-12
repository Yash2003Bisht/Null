import * as vscode from 'vscode';
import * as dotenv from 'dotenv';
import { OpenAI } from 'openai';
import { ChatOpenAI } from "@langchain/openai";
import { StructuredOutputParser } from 'langchain/output_parsers';
import { z } from 'zod';

dotenv.config();

const completionSchema = z.object({
	codeSnippet: z.string(),
	language: z.string(),
});

const openai = new OpenAI({
	apiKey: '',
});

const outputParser = StructuredOutputParser.fromZodSchema(completionSchema);

async function fetchCompletion(prompt: string): Promise<string> {
	const apiKey = vscode.workspace.getConfiguration('openaiCodeCompletion').get<string>('apiKey');

	const model = new ChatOpenAI({
		temperature: 0.5,
		openAIApiKey: apiKey,
		modelName: 'gpt-4o-mini',
	});

	if (!apiKey) {
		vscode.window.showErrorMessage("OpenAI API Key is missing.");
		return '';
	}

	try {
		const response = await model.call([
			{ role: 'system', content: "You are a helpful code assistant." },
			{ role: 'user', content: `${prompt}\nProvide the output in the following format: ${outputParser.getFormatInstructions()}` }
		]);

		const parsedOutput = await outputParser.parse(response.text);
		return parsedOutput.codeSnippet.trim();
	} catch (error) {
		console.error('Error parsing completion:', error);
		return "";
	}
}

async function checkApiKeyValidity(apiKey: string): Promise<boolean> {
	try {
		openai.apiKey = apiKey;
		await openai.models.list();
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

				// Customize prompt based on active document and cursor position
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
				console.log(completionText);

				if (!completionText) {
					return { items: [] };
				}

				const item = new vscode.InlineCompletionItem(completionText);
				item.range = new vscode.Range(position, position);

				return { items: [item] };
			}
		}
	);

	const setApiKeyCommand = vscode.commands.registerCommand('openaiCodeCompletion.setApiKey', async () => {
		const apiKey = await vscode.window.showInputBox({
			prompt: 'Enter your OpenAI API Key',
			placeHolder: 'sk-...',
			ignoreFocusOut: true,
			password: true
		});

		if (apiKey) {
			const isValidApiKey = await checkApiKeyValidity(apiKey);

			if (isValidApiKey) {
				await vscode.workspace.getConfiguration('openaiCodeCompletion').update('apiKey', apiKey, vscode.ConfigurationTarget.Global);
				vscode.window.showInformationMessage('API Key saved successfully.');
			} else {
				vscode.window.showErrorMessage('Invalid API Key. Please check and try again.');
			}
		} else {
			vscode.window.showErrorMessage('API Key is required!');
		}
	});

	context.subscriptions.push(setApiKeyCommand);
	context.subscriptions.push(completionProvider);
}

export function deactivate() { }
