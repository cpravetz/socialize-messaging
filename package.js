/* global Package */
Package.describe({
    name: 'socialize:messaging',
    summary: 'A social messaging package',
    version: '1.2.4',
    git: 'https://github.com/copleykj/socialize-messaging.git',
});

Package.onUse(function _(api) {
    api.versionsFrom(['1.10.2', '2.3','3.0']);

    api.use([
        'check',
        'socialize:user-presence',
        'socialize:linkable-model',
        'reywood:publish-composite',
    ]);

    api.mainModule('server.js', 'server');
    api.mainModule('common.js', 'client');
});
