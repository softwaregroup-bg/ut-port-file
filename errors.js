'use strict';
module.exports = ({ defineError, fetchErrors }) => {
    const FilePort = defineError('filePort', undefined, 'File error');
    defineError('watch', FilePort, 'Watch error');
    const Arguments = defineError('arguments', FilePort, 'Invalid arguments error');
    defineError('absolutePath', Arguments, 'Absolute path error');
    defineError('invalidFileName', Arguments, 'Writing outside of base dir is forbidden');
    return fetchErrors('filePort');
};
