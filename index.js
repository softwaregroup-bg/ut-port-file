(function(define) {define(function(require) {
    //dependencies
    var Port = require('ut-bus/port');
    var util = require('util');
    var fs = require('fs');
    var through2 = require('through2');
    var glob = require('glob');

    function FilePort() {
        Port.call(this);

        this.config = {
            id: null,
            logLevel: '',
            type: 'file',
            watchDir: '',
            processingDir: '',
            doneDir: '',
            filePattern: '*.txt',
            readFiles: false,
            checkPeriod: 350000
        };

        this.stream = null;
        this.fsWatcher = null;
        this.watchInterval = null;
    }

    util.inherits(FilePort, Port);

    FilePort.prototype.init = function init() {
        Port.prototype.init.apply(this, arguments);
        if (!this.config.watchDir || !this.config.processingDir || !this.config.doneDir) {
            throw new Error('Missing configuration for file dirs!');
        }
    };

    FilePort.prototype._startWatcher = function _startWatcher() {
        this.fsWatcher = fs.watch(this.config.watchDir, function(event, filename) {
            this.fsWatcher.close();
            this._processFiles();
        }.bind(this));
    };

    FilePort.prototype._processFile = function _processFiles(fileName) {
        var watchFile = this.config.watchDir + '\\' + fileName;
        if (fs.existsSync(watchFile)) {

            var filePath = this.config.processingDir + '\\' + fileName;
            fs.renameSync(watchFile, filePath);
            if (!this.config.readFiles) {
                this.stream.write({$$: {mtid: 'request'}, fileName: fileName})
            } else {
                var doneDir = this.config.doneDir;
                var readStream = fs.createReadStream(filePath);
                readStream.on('end', function() {
                    fs.renameSync(filePath, doneDir + '\\' + fileName);
                });
                readStream.on('error', function(err) {
                    //todo: on err?
                    throw new Error('fs.createReadStream ERROR! ' + err);
                });
                this.pipe(readStream);
            }
        }
    };

    FilePort.prototype._processFiles = function _processFiles() {

        var options = {
            cwd: this.config.watchDir,
            sync: true,
            nodir: true,
            nosort: true
        };
        var filesAr = glob(this.config.filePattern, options);
        if (filesAr.length > 0) {
            for (var i = 0; i < filesAr.length; i++) {
                this._processFile(filesAr[i]);
            }
            this._processFiles();
        } else {
            this._startWatcher();
        }
    };

    FilePort.prototype.start = function start(callback) {
        Port.prototype.start.apply(this, arguments);

        if (!this.config.readFiles) {
            var procDir = this.config.processingDir;
            var doneDir = this.config.doneDir;
            this.stream = through2.obj(function(chunk, enc, callback) {

                if (chunk.$$ && chunk.$$.mtid == 'request') {
                    this.push(chunk);
                } else {
                    fs.renameSync(procDir + '\\' + chunk.fileName, doneDir + '\\' + chunk.fileName);
                }
                callback();
            });
            this.pipe(this.stream);
        }

        this._startWatcher();

        this.watchInterval = setInterval(function() {
            this.fsWatcher.close();
            this._processFiles();
        }.bind(this), this.config.checkPeriod ? this.config.checkPeriod : 350000);

    };

    FilePort.prototype.stop = function start(callback) {
        this.fsWatcher.close();
        clearInterval(this.watchInterval);
        Port.prototype.stop.apply(this, arguments);
    };
    return FilePort;

});}(typeof define === 'function' && define.amd ? define : function(factory) { module.exports = factory(require); }));
