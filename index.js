var when = require('when');
var node = require('when/node');
var fs = require('fs');
var minimatch = require('minimatch');
var stat = node.lift(fs.stat);
var through2 = require('through2');

function FilePort() {
    this.config = {
        id: null,
        logLevel: '',
        type: 'file',
        watch: '',
        pattern: '',
        matchConfig: {},
        doneDir: ''
    };

    this.stream;
    this.streamNotifier;
    this.notifyData = {};
    this.fsWatcher;
    this.patternMather;
}

FilePort.prototype.init = function init() {
    if (!this.config.watch) {
        throw new Error('Missing configuration for file dirs!');
    }
};

FilePort.prototype.start = function start() {
    this.stream = through2.obj(function(chk, enc, cb) {
        this.push(chk);
        cb();
    });
    this.pipe(this.stream);

    // start watching
    this.watch();
    this.bindNotifier();
};

FilePort.prototype.stop = function start() {
    clearInterval(this.streamNotifier);
    this.fsWatcher.close();
};

FilePort.prototype.watch = function watch() {
    // start watching
    this.fsWatcher = fs.watch(this.config.watch, {recursive: true}, function(event, filename) {
        var saw = `${this.config.watch}${filename}`;
        // collect info based on filename
        this.notifyData[saw] = {event: event, filename: filename, watch: this.config.watch, time: Date.now()};
    }.bind(this));
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
                if (minimatch(el, this.config.pattern, this.config.matchConfig)) {
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
                    })
                    .catch(function(e) {
                        delete d[el];// delete file/dir because there is some error thrown by stat
                    });
            });
            when
                .settle(found)
                .then(function(v) {
                    if (Object.keys(d).length > 0) { // notify stream if there is any elements
                        this.stream.write(JSON.stringify(d));
                    }
                }.bind(this));
        }
    }.bind(this), 5000);
};

module.exports = FilePort;
