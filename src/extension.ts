/* eslint-disable @typescript-eslint/naming-convention */
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import createStore from './createStore';
import * as fs from 'fs';
import * as path from 'path';
import { minimatch } from 'minimatch';

const ACTIVE_COLOR = '#22008822';
let maxRecurseDepth = 5;
let workingDirectory = null;
let store: any = null;
let config: vscode.WorkspaceConfiguration | null = null;

const ALWAYS_EXCLUDE_FILES = [
	".git",
	".next",
	".vscode",
	"node_modules"
];




const log = (...str: any[]) => console.log('HIDDO:', ...str);

const toggleColor = (on:boolean = false) => {
	if (!config){ return; }
	config.update("workbench.colorCustomizations", { 
		"activityBar.background": on ? ACTIVE_COLOR : null ,
		"sideBar.background": on ? ACTIVE_COLOR : null 
	});
};



const popup = (str:string = '') => {
	vscode.window.showInformationMessage(str);
};


function findWorkspaceFolderWithSettingsFile() {
	const workspaceFolders = vscode.workspace.workspaceFolders;
	if(!workspaceFolders){
		return;
	}
	for (const workspaceFolder of workspaceFolders) {
		const settingsFilePath = workspaceFolder.uri.fsPath + '/hiddo.json';
		if (fs.existsSync(settingsFilePath)) {
			log(`Found hiddo.json: ${settingsFilePath}`);
			let configFile = fs.readFileSync(settingsFilePath, { encoding: 'utf-8' });
			let parsedConfig = JSON.parse(configFile);
			if(!Object.entries(parsedConfig)){
				log("No entries in hiddo config!");
				return;
			}
			Object.entries(parsedConfig).forEach(([zoneName, patterns]) => {
				if(typeof zoneName !== 'string' || !Array.isArray(patterns) || patterns.some(x => typeof x !== 'string')){
					popup('Hiddo: Malformed config - all keys should be strings and values should be array of string patterns to match.');
					return;
				}
			});
			store.set('zones', parsedConfig);
			log('Zone config parsed and loaded:', parsedConfig);
			if(!store.get('activeZone')){
				let zone = Object.keys(parsedConfig)[0];
				log('No active zone, set to first zone:', zone);
			}
			return;
		}
	}
}

// const isDirectory = (input: string | fs.PathLike | fs.Dirent) => {
// 	try {
// 		// If input is a Dirent object, use its isDirectory method
// 		if (input instanceof fs.Dirent) {
// 			return input.isDirectory();
// 		}
// 		// If input is a string or PathLike object, use lstatSync
// 		else if (typeof input === 'string' || input instanceof Buffer || typeof input === 'object') {
// 			return fs.lstatSync(input)?.isDirectory() ?? false;
// 		}
// 		// For other types of input, return an error
// 		else {
// 			throw new Error('Invalid input: input must be a path (string or Buffer) or Dirent object');
// 		}
// 	} catch (error) {
// 		console.error(`Error: ${error}`);
// 		return false;
// 	}
// };

// const getPath = (p: string | fs.Dirent):string => {
// 	return typeof p === 'string' ? p : p?.path ?? p.name;
// };

// const isExcluded = (path:any) => {
// 	return ALWAYS_EXCLUDE_FILES.includes(getPath(path));
// };

// let excluded = [];

// const processDirectory = async (path: string | fs.Dirent) => {
// 	if(!path || path === '' || isExcluded(path)){
// 		log('Invalid path:', path);
// 		return;
// 	}
// 	let filePaths:any[] = [];
// 	try{
// 		// log('Checking path type of:', path);
// 		if (isDirectory(path)) {
// 			if (isExcluded(path)) {
// 				log('excluding path:', path);
// 				return;
// 			}
// 			if(!fs.existsSync(getPath(path))){
// 				log('No file found at path:', path);
// 				return;
// 			}
// 			log('Recurse in dir:', path);
// 			filePaths = fs.readdirSync(getPath(path), { withFileTypes: true });
// 			log('Found paths:', filePaths);
// 			filePaths.forEach(p => {

// 				if (isExcluded(p)){
// 					log('excluding path:', p);
// 					return;
// 				} else if (isDirectory(p)) {
// 					log('Found directory to recurse:', p);
// 					processDirectory(p);
// 				}else{
// 					log('>> PATH:', p);
// 					excluded.push(p.name);
// 				}
// 			})
// 		} else {
// 			log('>> FILE:', path);
// 			excluded.push((path as fs.Dirent)?.name ?? path);

// 			// This is a file, process it.
// 			// ...
// 		}
// 	}catch(err){
// 		log(`OOPS: error at path "${path}"\n`, 
// 		`is dirent: "${path instanceof fs.Dirent}"`, 
// 		path, err);
// 	}
// };

async function exploreFiles(dir: string, exclusions: string[], filePaths: string[]) {
	return new Promise<void>((resolve, reject) => {
		fs.readdir(dir, async (err, files) => {
			if (err) {
				reject(err);
				return;
			}

			for (let i = 0; i < files.length; i++) {
				if (exclusions.includes(files[i])) {
					continue;
				}
				const currentPath = path.join(dir, files[i]);
				const stat = fs.lstatSync(currentPath);
				if (stat.isDirectory()) {
					filePaths.push(currentPath)
					await exploreFiles(currentPath, exclusions, filePaths);
				} else {
					filePaths.push(currentPath);
				}
			}
			resolve();
		});
	});
}

// In the activate function, we first check whether any workspace is open.
// If it's open, we start exploring the files in the workspace directories 
// except for the exclusion list. Once all the paths are collected, you can 
// use it for your needs.

// Note: In a real world scenario, consider using the vscode.workspace.findFiles
//  method to look for files in the workspace.This method returns a promise that 
// resolves to an array of vscode.Uri objects.By using a glob pattern, you can 
// specify the types of files you're interested in and exclude others



const enableHiddo = async () => {

	const workspaceFolders = vscode.workspace.workspaceFolders;

	if (!workspaceFolders) {
		vscode.window.showInformationMessage('No folder is open');
		return;
	}

	if(!store.get('activeZone') && Object.entries(store.get('zones')).length){
		let activeZone = Object.keys(store.get('zones'))[0];
		store.set('activeZone', activeZone);
		log('Zones found with no active zone - using first zone:', store.get('activeZone'));
	}

	const exclusions = ['.next', '.git', 'node_modules'];

	let filePaths: string[] = [];
	for (const workspaceFolder of workspaceFolders) {
		await exploreFiles(workspaceFolder.uri.fsPath, exclusions, filePaths);
	}

	filePaths.push(...ALWAYS_EXCLUDE_FILES);

	// Do something with filePaths array
	console.log(filePaths);

	const filePathsBoolMap = filePaths.reduce((obj:any, key:string) => {
		let settingsGlobKey = key.split('/').pop() ?? key;
		let activeZone = store.get('activeZone');
		let zones = store.get('zones');
		let zonePatterns = zones[activeZone];
		log(zones);
		log('Using active zone:', activeZone);
		log('Contains patterns:', zonePatterns);
		let isHidden = true;
		Object.values(zones[activeZone])?.forEach((value:unknown) => {
			let match = minimatch(key, value as string);
			// log('matching:', {
			// 	key, value, match
			// });
			if (match && isHidden){
				isHidden = false;
			}
		});
		// log('>> BOOLMAP:', {
		// 	key,
		// 	activeZone,
		// 	zones,
		// 	zone: zones[activeZone],
		// 	isHidden,
		// });
		obj[settingsGlobKey] = isHidden;
		return obj;
	}, {});

	config?.update('files.exclude', {
		...store.get('initialExcludedFiles'),
		'______hiddo______': true,
		...filePathsBoolMap,
	});

};


// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	log('Activating...');

	store = createStore(context);
	config = vscode.workspace.getConfiguration();
	findWorkspaceFolderWithSettingsFile();
	
	
	log('Getting initial excluded files...');
	store.set('initialExcludedFiles', config.get('files.exclude') || {}); 

	const commands: Record<string, (...args:any[]) => void> = {

		'hiddo.enable': () => { 
			if(!config){ return; }
			if(!store.get('enabled')){
				store.set('enabled', true);
				log('Enabled:', store.get('enabled'));
				toggleColor(true);
				popup('Hiddo enabled');
			} else {
				popup('Hiddo disabled');
				
				popup('Hiddo refreshing store');
				log('Refreshing store');
			}
			// reload config:
			if(!store.get('activeZone')){
				popup("Hiddo: No active zone! Set a zone with the 'hiddo.zone' command to enable this zone.");
			}
				// check if there is a hiddo file hiddo.yaml
				// create one if not exist
				// load the key/values from hiddo.yaml into store.zones
				// so store.zones is an object where k is name and v is array of glob strings
				// in the config its {"**/glob_string/**": true,} or no k/v 

			enableHiddo();


		},
		
		'hiddo.disable': () => { 
			if (!config) { return; }
			if (!store.get('enabled')) {
				log('Already disabled...');
				popup("Hiddo already disabled. Use 'hiddo.enable' to refresh");

				return;
			}

			store.set('enabled', false);
			toggleColor(false);
			log('Enabled:', store.get('enabled'));
			config.update('files.exclude', store.get('initialExcludedFiles'));
			popup('Hiddo disabled');
		},

		'hiddo.zone': async () => {
			let zoneKeys = Object.keys(store.get('zones'));

			vscode.window.showQuickPick(zoneKeys).then(selected => {
				log(selected);
				store.set('activeZone', selected);
				store.set('enabled', true);
				log('Enabled:', store.get('enabled'));
				toggleColor(true);
				enableHiddo();

			});
		},

		'hiddo.status': () => {
			log('Status:', {
				enabled: store.get('enabled'),
				zone: store.get('activeZone'),
				zones: store.get('zones'),
			});
			console.log(store.get('initialExcludedFiles'));
		},
		
		'hiddo.helloWorld': () => {
			popup('Hello World from Hiddo!');
		},
	
	};

	Object.entries(commands).forEach(([name, cb]) => {
		let disposable = vscode.commands.registerCommand(name, cb);
		context.subscriptions.push(disposable);
	});

	
	log('Hiddo activated');
}

// This method is called when your extension is deactivated
export function deactivate() {
	log('Deactivating...');

	toggleColor(false);
	config?.update('files.exclude', store.get('initialExcludedFiles'));

}
