'use strict';
const chokidar = require('chokidar');
const fs = require('fs-plus');
const path = require('path');

module.exports = function({utPort}) {
    let filePortErrors;

    return class FilePort extends utPort {
        constructor() {
            super(...arguments);
            if (!this.errors || !this.errors.getError) throw new Error('Please use the latest version of ut-port');
            filePortErrors = require('./errors')(this.errors);
            this.streamNotifier = null;
            this.notifyData = new Map();
            this.fsWatcher = null;
        }
        get defaults() {
            return {
                id: null,
                type: 'file',
                writeBaseDir: null,
                writeTriesCount: 3,
                writeRetryTimeout: 500,
                watch: null, // paths
                watcherOptions: {alwaysStat: true, depth: 0}, // https://github.com/paulmillr/chokidar#api
                notifyTimeout: null,
                doneDir: null,
                events: ['add']
            };
        }
        async init() {
            const result = await super.init(...arguments);
            this.bytesSent = this.counter && this.counter('counter', 'bs', 'Bytes sent', 300);
            this.bytesReceived = this.counter && this.counter('counter', 'br', 'Bytes received', 300);
            this.config.writeBaseDir = path.join(this.bus.config.workDir, 'ut-port-file', this.config.id);
            return result;
        }
        async start() {
            await super.start(...arguments);
            this.watch();
            const result = await new Promise((resolve, reject) => fs.makeTree(this.config.writeBaseDir, error => {
                if (error && error.code !== 'EEXIST') {
                    reject(error);
                } else {
                    resolve('Dir for journal log files has been created: ' + this.config.writeBaseDir);
                }
            }));
            this.pull(this.exec, {conId: 'write'});
            return result;
        }
        async exec({ filename, data, encoding = 'utf8', append = true }) {
            if (!filename || !data) {
                throw filePortErrors['filePort.arguments']();
            }
            if (path.isAbsolute(filename)) {
                throw filePortErrors['filePort.arguments.absolutePath']();
            }
            filename = path.resolve(this.config.writeBaseDir, filename);
            if (!filename.startsWith(this.config.writeBaseDir + path.sep)) {
                throw filePortErrors['filePort.arguments.invalidFileName']();
            }
            return new Promise((resolve, reject) => {
                let triesLeft = this.config.writeTriesCount;
                let tryWrite = () => {
                    fs[append ? 'appendFile' : 'writeFile'](filename, data, encoding, err => {
                        if (err) {
                            if (--triesLeft <= 0) {
                                reject(filePortErrors['filePort'](err));
                            } else {
                                setTimeout(tryWrite, this.config.writeRetryTimeout);
                            }
                        } else {
                            !this.codec && this.bytesSent && this.bytesSent(Buffer.byteLength(data, encoding));
                            resolve({});
                        }
                    });
                };
                tryWrite();
            });
        }
        stop() {
            this.streamNotifier && clearInterval(this.streamNotifier);
            this.streamNotifier = null;
            this.fsWatcher && this.fsWatcher.close();
            this.fsWatcher = null;
            return super.stop();
        }
        watch() {
            if (!this.config.watch) {
                return;
            }
            let queue = this.pull(null, {conId: 'watch'});
            this.fsWatcher = chokidar.watch(this.config.watch, this.config.watcherOptions);
            this.fsWatcher.on('error', error => this.error(filePortErrors['filePort.watch'](error)));
            this.config.events.forEach(eventName => this.fsWatcher.on(eventName, (path, stat) => {
                let event = [{
                    path,
                    time: Date.now(),
                    stat
                }, {
                    method: eventName,
                    mtid: 'event'
                }];
                if (this.config.notifyTimeout) {
                    this.notifyData.set(path, event);
                } else {
                    queue.push(event);
                }
            }));

            if (this.config.notifyTimeout) {
                this.streamNotifier = setInterval(() => {
                    let events = Array.from(this.notifyData.values());
                    this.notifyData.clear();
                    events.forEach(event => queue.push(event));
                }, this.config.notifyTimeout);
            }
        }
    };
};
