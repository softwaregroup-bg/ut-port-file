var F = require('../');
var fs = require('fs');
var exec = require('child_process').exec;
var through2 = require('through2');
var ff = new F();
exec('rm -rf ./watchdir/', function(err, out) {
    console.log(out); err && console.log(err);
});
ff.pipe = function(stream) {
    stream.pipe(through2(function(c, e, d) {
        console.log(c.toString());
        d();
    }));
};
ff.config = {
    watch: './watchdir/',
    pattern: '*.foo',
    matchConfig: {
        matchBase: true
    },
    doneDir: '',
    streamFile: false
};
fs.mkdirSync('./watchdir/');
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
        setTimeout(write, 1);
    } else {
        ws.end();
        // exec('rm -rf ./watchdir/', function(err, out) {
        //   console.log(out); err && console.log(err);
        // });
    }
}

write();
