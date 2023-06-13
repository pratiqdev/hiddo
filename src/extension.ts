/* eslint-disable @typescript-eslint/naming-convention */
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import createStore from './createStore';
import * as fs from 'fs';
import * as path from 'path';
import { minimatch } from 'minimatch';

const ACTIVE_COLOR = '#22008822';
let store: any = null;
let config: vscode.WorkspaceConfiguration | null = null;

const ALWAYS_EXCLUDE_FILES = [
	".git",
	".next",
	".vscode",
	"node_modules"
];




const log = (...str: any[]) => console.log('HIDDO:', ...str);

let statusBarItem:vscode.StatusBarItem | null = null;

const toggleColor = (on:boolean = false) => {

	if(!statusBarItem){ return; }

	// statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	statusBarItem.text = on ? `$(zap) ${store.get('activeZone')}` : `$(zap) disabled`;
	statusBarItem.tooltip = on ? "Cycle Next Zone" : "Enable Hiddo filtering";
	statusBarItem.command = "hiddo.nextZone";
	statusBarItem.color = "yellow";
	statusBarItem.name = "Hiddo Explorer Filter";
	// on ? statusBarItem.show() : statusBarItem.hide()
	// statusBarItem.show();
};

const popup = (str:string = '', err:boolean = false) => {
	const options = { modal: false };
	err 
		? vscode.window.showErrorMessage('HIDDO: ' + str, options)
		: vscode.window.showInformationMessage('HIDDO: ' + str, options);

};

const loadHiddoConfig = () => {
	const workspaceFolders = vscode.workspace.workspaceFolders;
	if(!workspaceFolders){
		return;
	}
	for (const workspaceFolder of workspaceFolders) {
		const settingsFilePath = workspaceFolder.uri.fsPath + '/hiddo.json';
		if (fs.existsSync(settingsFilePath)) {
			// log(`Found hiddo.json: ${settingsFilePath}`);
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
			// log('Zone config parsed and loaded:', parsedConfig);
			if(!store.get('activeZone')){
				let zone = Object.keys(parsedConfig)[0];
				log('No active zone, set to first zone:', zone);
			}
			return;
		}
	}
};

const exploreFiles = async (dir: string, exclusions: string[], filePaths: string[]) => {
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
};







const enableHiddo = async () => {

	const workspaceFolders = vscode.workspace.workspaceFolders;
	// update config
	config = vscode.workspace.getConfiguration();

	if (!workspaceFolders) {
		vscode.window.showInformationMessage('No folder is open');
		return;
	}

	loadHiddoConfig();

	if(!Object.entries(store.get('zones')).length){
		const err = 'Cannot enable hiddo - no zones defined, or no "hiddo.json" config found.';
		log(err);
		popup(err, true);
		return;
	}

	if(!store.get('activeZone') && Object.entries(store.get('zones')).length){
		let activeZone = Object.keys(store.get('zones'))[0];
		store.set('activeZone', activeZone);
		store.set('activeZoneIndex', 0);
		const err = `No active zone - using first zone: "${store.get('activeZone')}"`;
		log(err);
	}else if(!store.get('activeZone') && !Object.entries(store.get('zones')).length){
		const err = `No zones found and no active zone set! Check your 'hiddo.json' file`;
		log(err);
		popup(err, true);
		return;
	}

	if(!store.get('hasDefaults')){
		store.set('initialExcludedFiles', config?.get('files.exclude') || {}); 
		store.set('hasDefaults', true);
		const err = `No defaults - saving current config! Run 'hiddo.defaults' to save the current exclusions as defaults.`;
		log(err);
		popup(err, true);
	}



	store.set('enabled', true);


	const exclusions = ['.next', '.git', 'node_modules'];

	let filePaths: string[] = [];
	for (const workspaceFolder of workspaceFolders) {
		await exploreFiles(workspaceFolder.uri.fsPath, exclusions, filePaths);
	}

	filePaths.push(...ALWAYS_EXCLUDE_FILES);

	const filePathsBoolMap = filePaths.reduce((obj:any, key:string) => {
		let settingsGlobKey = key.split('/').pop() ?? key;
		let activeZone = store.get('activeZone');
		let zones = store.get('zones');
		let zonePatterns = zones[activeZone];
		// log(zones);
		// log('Using active zone:', activeZone);
		// log('Contains patterns:', zonePatterns);
		let isHidden = true;
		Object.values(zones[activeZone])?.forEach((value:unknown) => {
			let match = key === value || minimatch(key, value as string);
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

	const zones = store.get('zones');
	const activeZone = store.get('activeZone');
	const originalPatternBoolMap:any = {};
	zones[activeZone].forEach((pattern:string) => {
		originalPatternBoolMap[pattern.replace('!', '')] = pattern.startsWith('!') ? true : false;
	});

	config?.update('files.exclude', {
		...store.get('initialExcludedFiles'),
		'========================================================== HIDDO START': true,
		...filePathsBoolMap,
		...originalPatternBoolMap,
		'========================================================== HIDDO END': true
	});

	log('Hiddo enabled!');
	// popup("Hiddo enabled!");
	

};


export const activate = (context: vscode.ExtensionContext) => {
	log('Activating...');
	toggleColor(false);
	store = createStore(context);
	config = vscode.workspace.getConfiguration('hiddo');
	// loadHiddoConfig();

	statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
	statusBarItem.show();
	
	

	const commands: Record<string, (...args:any[]) => void> = {

		'hiddo.enable': () => { 
			if(!config){ return; }

			// check if there is a hiddo file hiddo.yaml
				// create one if not exist
				// load the key/values from hiddo.yaml into store.zones
				// so store.zones is an object where k is name and v is array of glob strings
				// in the config its {"**/glob_string/**": true,} or no k/v 

			enableHiddo();
			toggleColor(store.get('enabled'));


		},

		'hiddo.nextZone': () => { 
			if(!config){ return; }

			let idx = store.get('activeZoneIndex') ?? 0;
			let zones = store.get('zones');
			let keys = Object.keys(zones);
			log('--- NEXT ZONE --------------------------------');
			log('>> Idx:', idx, keys[idx]);

			if(idx === keys.length - 1){
				store.set('activeZoneIndex', - 1);
				store.set('enabled', false);
				config.update('files.exclude', store.get('initialExcludedFiles') ?? {});
				toggleColor(store.get('enabled'));
				log('>> Idx reached end of zones - turning off hiddo');
			}else{
				idx++;
				store.set('activeZone', keys[idx]);
				store.set('activeZoneIndex', idx);
				enableHiddo();
				toggleColor(store.get('enabled'));
				log('>> new Idx:', idx, keys[idx]);

			}

		},
		
		'hiddo.disable': () => { 
			if (!config) { return; }
			
			store.set('enabled', false);
			config.update('files.exclude', store.get('initialExcludedFiles'));
			toggleColor(store.get('enabled'));
			log('Enabled:', store.get('enabled'));
		},


		'hiddo.defaults': () => {
			store.set('initialExcludedFiles', config?.get('files.exclude') || {}); 
			store.set('hasDefaults', true);
			popup("Set default excluded files.");
		},

		'hiddo.zone': async () => {
			// load the zones again if the hiddo fille has changed
			loadHiddoConfig();
			let zoneKeys = Object.keys(store.get('zones'));

			vscode.window.showQuickPick(zoneKeys).then(selected => {
				log(selected);
				store.set('activeZone', selected);
				enableHiddo();
				toggleColor(store.get('enabled'));

			});
		},


	
	};

	Object.entries(commands).forEach(([name, cb]) => {
		let disposable = vscode.commands.registerCommand(name, cb);
		context.subscriptions.push(disposable);
	});

	
	log('Hiddo activation complete ----------------------------------');
	toggleColor(store.get('enabled'));
};

// This method is called when your extension is deactivated
export const deactivate = () => {
	log('Deactivating...');

	toggleColor(false);
	config?.update('files.exclude', {});
};
