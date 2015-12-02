# UT Port File

## Options example

```
    watch: [], // what to watch, example list of [path,path,file,file]
    pattern: '*', // what to match
    watcherOptions: {}, // https://github.com/paulmillr/chokidar#api
    matcherOptions: {}, // https://github.com/isaacs/minimatch#properties
    notifyTimeout: 5000, // because we don't need to notify on every event we will notify once per 5 sec in this example
    doneDir: null // where to move all files passed to caller
```