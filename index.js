'use strict';
const merge = require('lodash.merge');
const chokidar = require('chokidar');
const util = require('util');
const errors = require('./errors');
const fs = require('fs-plus');
const path = require('path');

module.exports = function({parent}) {
    function FilePort({config}) {
        parent && parent.apply(this, arguments);
        this.config = merge({
            id: null,
            type: 'file',
            logLevel: 'info',
            writeBaseDir: null,
            writeTriesCount: 3,
            writeRetryTimeout: 500,
            watch: null, // paths
            watcherOptions: {alwaysStat: true, depth: 0}, // https://github.com/paulmillr/chokidar#api
            notifyTimeout: null,
            doneDir: null,
            events: ['add']
        }, config);
        this.streamNotifier = null;
        this.notifyData = new Map();
        this.fsWatcher = null;
    }

    if (parent) {
        util.inherits(FilePort, parent);
    }

    FilePort.prototype.init = function init() {
        parent && parent.prototype.init.apply(this, arguments);
        this.bytesSent = this.counter && this.counter('counter', 'bs', 'Bytes sent', 300);
        this.bytesReceived = this.counter && this.counter('counter', 'br', 'Bytes received', 300);
        this.config.writeBaseDir = path.join(this.bus.config.workDir, 'ut-port-file', this.config.id);
    };

    FilePort.prototype.start = function start() {
        parent && parent.prototype.start.apply(this, arguments);

        this.watch();
        return new Promise((resolve, reject) => fs.access(this.config.writeBaseDir, fs.R_OK | fs.W_OK, err => {
            if (err) {
                if (err.code === 'ENOENT') {
                    fs.makeTree(this.config.writeBaseDir, err => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve('Dir for journal log files has been created: ' + this.config.writeBaseDir);
                        }
                    });
                } else {
                    reject(err);
                }
            } else {
                resolve('Dir for journal log files has been verified: ' + this.config.writeBaseDir);
            }
        })).then(result => {
            this.pull(this.exec, {conId: 'write'});
            return result;
        });
    };

    FilePort.prototype.exec = function exec({filename, data, encoding = 'utf8', append = true}) {
        if (!filename || !data) {
            return Promise.reject(errors.arguments());
        }
        if (path.isAbsolute(filename)) {
            return Promise.reject(errors.absolutePath());
        }
        filename = path.resolve(this.config.writeBaseDir, filename);
        if (!filename.startsWith(this.config.writeBaseDir + path.sep)) {
            return Promise.reject(errors.invalidFileName());
        }
        return new Promise((resolve, reject) => {
            let triesLeft = this.config.writeTriesCount;
            let tryWrite = () => {
                fs[append ? 'appendFile' : 'writeFile'](filename, data, encoding, err => {
                    if (err) {
                        if (--triesLeft <= 0) {
                            reject(errors.file(err));
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
    };

    FilePort.prototype.stop = function start() {
        this.streamNotifier && clearInterval(this.streamNotifier);
        this.streamNotifier = null;
        this.fsWatcher && this.fsWatcher.close();
        this.fsWatcher = null;
    };

    FilePort.prototype.watch = function watch() {
        if (!this.config.watch) {
            return;
        }
        let queue = this.pull(null, {conId: 'watch'});
        this.fsWatcher = chokidar.watch(this.config.watch, this.config.watcherOptions);
        this.fsWatcher.on('error', error => this.error(errors.watch(error)));
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
    };

    return FilePort;
};
