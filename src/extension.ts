/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as glob from 'glob';
import { minimatch } from 'minimatch';

const CONFIG_FILE_PATH = './hiddo.json';
let cwd = null;


const log = console.log;

type State = {
	zones: Record<string, string[]>;
	zone: null | string;
	index: number;
	enabled: boolean;
	defaults: Record<string, any>;
	hasDefaults: boolean;
};

const state:State = {
	zones: {},
	zone: null,
	index: 0,
	enabled: false,
	defaults: {},
	hasDefaults: false,
};


//&																																											
const setExclusionRules = (rules:Record<string, boolean>) => {
	vscode.workspace.getConfiguration().update('files.exclude', rules, vscode.ConfigurationTarget.Workspace);
};




//&																																											
function generateAndSetExcludeRules(): void {

	if(!state.zone || !state.hasDefaults || !Object.keys(state.zones).length){
		log("Cannot generate exclude rules:", state);
		return;
	}

    // Get the glob patterns for the specified zone
    let globPatterns: string[] = state.zones[state.zone];
	// Initialize exclude rules
	let excludeRules: Record<string, boolean> = {};

	if(!vscode?.workspace?.workspaceFolders || !vscode.workspace.workspaceFolders[0]?.uri?.fsPath){
		log('No open workspaces or directories...');
		return;
	}

    // Get a list of all files and directories in workspace
	let rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
    let allFilesAndDirs = glob.sync('**', { 
        cwd: rootPath, 
        dot: true,
        mark: true // add a trailing / to directories
    });


    // Exclude files/directories that do not match any glob pattern in the specified zone
    allFilesAndDirs.forEach((fileOrDir:string) => {
        let isExcluded = !globPatterns.some(pattern => minimatch(fileOrDir, pattern));
        excludeRules[fileOrDir] = isExcluded;
    });

	setExclusionRules(excludeRules);

}



//&																																											
const refresh = () => {

	// refresh the config file
	let configFile = JSON.parse(fs.readFileSync(CONFIG_FILE_PATH, 'utf8'));

	if(!configFile || !Object.keys(configFile).length){
		log("No config file found...");
		return;
	}else{
		state.zones = configFile;
	}

	if(!state.hasDefaults){
		log("No defaults set. Set defaults with 'hiddo.defaults' to save the current exclusion rules");
		return;
	}

	if(!Object.entries(state.zones).length){
		log("No zones defined. Check your 'hiddo.json' config file.");
		return;
	}

	if(!state.zone){
		let keys = Object.keys(state.zones);
		if(keys.length){
			log("Setting active zone to first provided zone.");
			state.zone = keys[0];
		}else{
			log("No active zone and no zones available... Check you 'hiddo.json' config.");
			return;
		}
	}

	if(state.enabled){
		generateAndSetExcludeRules();
	}else{
		setExclusionRules(state.defaults);
	}

};





//&																																											
export const activate = (context: vscode.ExtensionContext) => {
	log('Activating...');
	const hiddoConfig = vscode.workspace.getConfiguration('hiddo');

	
	

	const commands: Record<string, (...args:any[]) => void> = {

		'hiddo.enable': () => { 
			log('Enabling...');
			state.enabled = true;
			refresh();


		},
		
		'hiddo.disable': () => { 
			log('Disabling...');
			state.enabled = false;
			refresh();
		},

		'hiddo.defaults': () => { 
			log('Setting defaults...');
			
		},


		


	
	};

	Object.entries(commands).forEach(([name, cb]) => {
		let disposable = vscode.commands.registerCommand(name, cb);
		context.subscriptions.push(disposable);
	});

};

// This method is called when your extension is deactivated
export const deactivate = () => {
	log('Deactivating...');
};
