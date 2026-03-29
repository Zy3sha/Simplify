
  cordova.define('cordova/plugin_list', function(require, exports, module) {
    module.exports = [
      {
          "id": "cordova-plugin-health.health",
          "file": "plugins/cordova-plugin-health/www/ios/health.js",
          "pluginId": "cordova-plugin-health",
        "clobbers": [
          "cordova.plugins.health"
        ]
        },
      {
          "id": "cordova-plugin-health.HealthKit",
          "file": "plugins/cordova-plugin-health/www/ios/HealthKit.js",
          "pluginId": "cordova-plugin-health",
        "clobbers": [
          "window.plugins.healthkit"
        ]
        }
    ];
    module.exports.metadata =
    // TOP OF METADATA
    {
      "cordova-plugin-health": "3.2.4"
    };
    // BOTTOM OF METADATA
    });
    