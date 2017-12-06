'use strict';
module.exports = create => {
    const FilePort = create('filePort', undefined, 'File error');
    const Arguments = create('arguments', FilePort, 'Invalid arguments error');

    return {
        file: FilePort,
        watch: create('watch', FilePort, 'Watch error'),
        arguments: Arguments,
        absolutePath: create('absolutePath', Arguments, 'Absolute path error'),
        invalidFileName: create('invalidFileName', Arguments, 'Writing outside of base dir is forbidden')
    };
};
