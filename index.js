var when = require('when');
var node = require('when/node');
var minimatch = require('minimatch');
var stat = node.lift(require('fs').stat);
var through2 = require('through2');
var chokidar = require('chokidar');
var Port = require('ut-bus/port');
var util = require('util');

var defaults = {
    id: {v: 'file'},
    type: {v: 'file'},
    logLevel: {v: 'trace'},
    watch: {v: []}, // paths
    pattern: {v: '*'},
    watcherOptions: {v: {}}, // https://github.com/paulmillr/chokidar#api
    matcherOptions: {v: {}}, // https://github.com/isaacs/minimatch#properties
    notifyTimeout: {v: 5000},
    doneDir: {v: null}
};

function FilePort() {
    Port.call(this);
    this.config = Object.keys(defaults).reduce(function(pv, cv) {
        pv[cv] = defaults[cv].v;
        return pv;
    }, {});
    this.stream;
    this.streamNotifier;
    this.notifyData = {};
    this.fsWatcher;
    this.patternMather;
}
util.inherits(FilePort, Port);

FilePort.prototype.init = function init() {
    Port.prototype.init.apply(this, arguments);

    this.config = Object
        .keys(defaults || {})
        .reduce(function(pv, cv) {
            pv[cv] = this.config[cv] || defaults[cv].v;
            return pv;
        }.bind(this), {});
};

FilePort.prototype.start = function start() {
    Port.prototype.start.apply(this, arguments);
    this.stream = through2.obj(function(chk, enc, cb) {
        this.push(chk);
        cb();
    });
    this.pipe(this.stream, {trace: 0, callbacks: {}});

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
    this.fsWatcher = chokidar.watch(this.config.watch, this.config.watcherOptions);
    this.fsWatcher.on('all', function(event, filename) {
        // collect info based on filename
        this.notifyData[filename] = {event: event, filename: filename, watch: this.config.watch, time: Date.now()};
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
                    })
                    .catch(function(e) {
                        delete d[el];// delete file/dir because there is some error thrown by stat
                    });
            });
            when
                .settle(found)
                .then(function(v) {
                    if (Object.keys(d).length > 0) { // notify stream if there is any elements
                        this.stream.write([d, {opcode: 'fs-changes', mtid: 'notification'}]);
                    }
                }.bind(this));
        }
    }.bind(this), this.config.notifyTimeout);
};

module.exports = FilePort;
