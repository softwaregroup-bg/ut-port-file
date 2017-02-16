'use strict';
const create = require('ut-error').define;

const FilePort = create('FilePort', undefined, 'File error');
const Arguments = create('Arguments', FilePort, 'Invalid arguments error');
const AbsolutePath = create('AbsolutePath', Arguments, 'Absolute path error');
const InvalidFileName = create('InvalidFileName', Arguments, 'Writing outside of base dir is forbidden');

module.exports = {
    file: cause => new FilePort(cause),
    arguments: cause => new Arguments(cause),
    absolutePath: cause => new AbsolutePath(cause),
    invalidFileName: cause => new InvalidFileName(cause)
};
