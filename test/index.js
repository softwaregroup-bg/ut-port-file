/* eslint no-console:0 */
var F = require('../');
var fs = require('fs');
var exec = require('child_process').exec;
var through2 = require('through2');
var ff = new F();

ff.pipe = function(stream) {
    stream.pipe(through2.obj(function(c, e, d) {
        console.log(c);
        d();
    }));
};
ff.config = {
    watch: './watchdir/',
    pattern: '*.foo',
    matcherOptions: {
        matchBase: true
    },
    doneDir: ''
};

exec('rm -rf ./watchdir/', function(err, out) {
    console.log(out); err && console.log(err);
});
fs.mkdirSync('./watchdir/');
ff.init();
ff.start();
var ws = fs.createWriteStream('./watchdir/test');
// set env
var wroteLines = 5;
var ws2 = fs.createWriteStream('./watchdir/test.foo');
ws2.write('aaaaaa');
ws2.end();
function write() {
    ws.write('line ' + (wroteLines - 1).toString(10));

    wroteLines = wroteLines - 1;
    if (wroteLines > 0) {
        console.log('test wrote line');
        setTimeout(write, 100);
    } else {
        ws.end();
    }
}

write();
