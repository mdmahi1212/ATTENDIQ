// Copy to secrets.h (gitignored) and fill in.
#pragma once

#define WIFI_SSID      "your-ssid"
#define WIFI_PASSWORD  "your-wifi-password"

#define MQTT_HOST      "192.168.0.10"   // edge laptop LAN IP
#define MQTT_PORT      1883
#define MQTT_USERNAME  "esp32-B204"
#define MQTT_PASSWORD  "change-me"
#define MQTT_CLIENT_ID "esp32-door-B204"

#define ROOM_CODE      "B204"           // subscribes to campus/B204/gate/feedback
