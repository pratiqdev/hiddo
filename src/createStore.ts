import * as vscode from 'vscode';

const FORCE_FRESH_INIT = false;

const log = (...str:any[]) => console.log('STORE:', ...str);

type CallbackFunction = (newVal: any, oldVal: any) => void;

interface Store {
    get: (key: string) => any;
    set: (key: string, value: any) => void;
    on: (key: string, callback: CallbackFunction) => void;
}

let INITIAL_EXCLUDED_FILES: null | Record<string, any> = null;

const initialStore = {
    activeZone: null,
    activeZoneIndex: 0,
    zones: {},
    enabled: false,
    isNew: false,
    initialExcludedFiles: {},
    hasDefaults: false,
};

function createStore(context: vscode.ExtensionContext): Store {
    try{
        log("Creating store...");

        const getConfig = (key:string) => {
            const config = vscode.workspace.getConfiguration('hiddo');
            return config?.get(key);
        };

        const listeners: { [key: string]: CallbackFunction[] } = {};
        const state = context.workspaceState;
        
        log('Getting initial excluded files...');
        INITIAL_EXCLUDED_FILES = getConfig('files.exclude') || {}; 
        log('Excluded files found.');

        
        try{
            log('Checking for fresh init...');
            if(FORCE_FRESH_INIT || !state.get('isNew')){
                log("Fresh store - setting initial values.");
                Object.entries(initialStore).forEach(([k,v]) => {
                    state.update(k,v);
                });
            }else{
                log('Existing store found.');
            }
        }catch(err){
            log('???:::', err);
        }

        log('Defining store methods...');

        function get(key: string): any {
            return state.get(key);
        }

        function set(key: string, value: any): void {
            const oldValue = context.workspaceState.get(key);
            state.update(key, value);

            if (listeners[key]) {
                for (const callback of listeners[key]) {
                    callback(value, oldValue);
                }
            }
        }

        function on(key: string, callback: CallbackFunction): void {
            if (!listeners[key]) {
                listeners[key] = [];
            }

            listeners[key].push(callback);
        }

        log('Store created.');

        return {
            get,
            set,
            on
        };

    }catch(err){
        log('ERROR:', err);
    }

    return {
        get: () => {},
        set: () => {},
        on: () => {},
    };
}

export default createStore;
