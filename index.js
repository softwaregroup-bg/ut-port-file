'use strict';
const when = require('when');
const node = require('when/node');
const minimatch = require('minimatch');
const stat = node.lift(require('fs').stat);
const through2 = require('through2');
const chokidar = require('chokidar');
const Port = require('ut-bus/port');
const util = require('util');
const errors = require('./errors');
const fs = require('fs-plus');
const path = require('path');

function FilePort() {
    Port.call(this);
    this.config = {
        id: null,
        type: 'file',
        logLevel: '',
        writeBaseDir: null,
        writeTriesCount: 3,
        writeRetryTimeout: 500,
        watch: [], // paths
        pattern: '*',
        watcherOptions: {}, // https://github.com/paulmillr/chokidar#api
        matcherOptions: {}, // https://github.com/isaacs/minimatch#properties
        notifyTimeout: 5000,
        doneDir: null
    };
    this.stream = null;
    this.streams = null;
    this.streamNotifier = null;
    this.notifyData = {};
    this.fsWatcher = null;
    this.patternMather = null;
}
util.inherits(FilePort, Port);

FilePort.prototype.init = function init() {
    Port.prototype.init.apply(this, arguments);
    this.bytesSent = this.counter && this.counter('counter', 'bs', 'Bytes sent', 300);
    this.bytesReceived = this.counter && this.counter('counter', 'br', 'Bytes received', 300);
    this.config.writeBaseDir = path.join(this.bus.config.workDir, 'ut-port-file', this.config.id);
};

FilePort.prototype.start = function start() {
    Port.prototype.start.apply(this, arguments);

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
        this.stream = through2.obj(function(chk, enc, cb) {
            this.push(chk);
            cb();
        });
        this.streams = this.pipe(this.stream, {trace: 0, callbacks: {}});
        this.pipeExec(this.exec.bind(this));
        this.watch();
        this.bindNotifier();
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
        var triesLeft = this.config.writeTriesCount;
        var tryWrite = () => {
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
    clearInterval(this.streamNotifier);
    this.fsWatcher.close();
};

FilePort.prototype.watch = function watch() {
    this.fsWatcher = chokidar.watch(this.config.watch, this.config.watcherOptions);
    this.fsWatcher.on('all', (event, filename) => {
        this.notifyData[filename] = {event: event, filename: filename, watch: this.config.watch, time: Date.now()};
    });
};

FilePort.prototype.bindNotifier = function watch() {
    // once per <second/s> write to stream if there is anything to write
    this.streamNotifier = setInterval(function() {
        var found = Object.keys(this.notifyData);
        if (found.length > 0) { // we found something!
            var d = this.notifyData;
            this.notifyData = {};// clear data, because we don't want to send old data when stream notifiers fires next time

            found
            .filter(function(el) { // match fiel/dir that we want
                if (minimatch(el, this.config.pattern, this.config.matcherOptions)) {
                    return true;
                } else {
                    delete d[el];// delete file/dir because there is some error thrown by stat
                    return false;
                }
            }.bind(this))
            .map(function(el, index) {
                found[index] = stat(el)// make file/dir stat
                    .then(function(v) { // write down stat value
                        d[el].stat = v;
                        return 0;
                    })
                    .catch(function(e) {
                        delete d[el];// delete file/dir because there is some error thrown by stat
                    });
            });
            return when
                .settle(found)
                .then(function(v) {
                    var list = Object.keys(d);
                    list.map(function(el) { // notify stream if there is any elements
                        this.receive(this.streams[2], [{
                            filename: d[el].filename,
                            time: d[el].time,
                            stat: d[el].stat
                        }, {opcode: d[el].event, mtid: 'notification'}]);
                    }.bind(this));
                }.bind(this));
        }
    }.bind(this), this.config.notifyTimeout);
};

module.exports = FilePort;
