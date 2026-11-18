// AttendIQ door LED (ESP32 + PubSubClient).
// Subscribes to campus/<ROOM>/gate/feedback ({"result":"ok"|"unknown"} from the edge) and lights
// GREEN for 1.5 s when a student was recognised, RED for 1.5 s when the face was unknown
// ("please verify on your phone"). Reconnects WiFi and MQTT with backoff; never blocks the loop.
//
// Board: ESP32 Dev Module (Arduino core for ESP32). Library: PubSubClient by Nick O'Leary (Library Manager).
// Wiring: GPIO 25 -> 220 ohm -> green LED anode, LED cathode -> GND
//         GPIO 26 -> 220 ohm -> red LED anode,   LED cathode -> GND
// Credentials: copy secrets.example.h to secrets.h (gitignored) and fill it in.

#include <WiFi.h>
#include <PubSubClient.h>
#include "secrets.h"

static const int PIN_GREEN = 25;
static const int PIN_RED = 26;
static const unsigned long FLASH_MS = 1500;

WiFiClient net;
PubSubClient mqtt(net);
String topic;
unsigned long ledOffAt = 0;
unsigned long nextMqttTry = 0;
unsigned long mqttBackoff = 1000;

void setLeds(bool green, bool red) {
  digitalWrite(PIN_GREEN, green ? HIGH : LOW);
  digitalWrite(PIN_RED, red ? HIGH : LOW);
}

void flash(bool ok) {
  setLeds(ok, !ok);
  ledOffAt = millis() + FLASH_MS;
}

// Payload is tiny JSON from the edge; a substring check avoids pulling in a JSON library.
void onMessage(char* t, byte* payload, unsigned int len) {
  String body;
  body.reserve(len);
  for (unsigned int i = 0; i < len; i++) body += (char)payload[i];
  if (body.indexOf("\"ok\"") >= 0) flash(true);
  else if (body.indexOf("\"unknown\"") >= 0) flash(false);
  Serial.printf("feedback: %s\n", body.c_str());
}

void ensureWifi() {
  if (WiFi.status() == WL_CONNECTED) return;
  static unsigned long nextTry = 0;
  if (millis() < nextTry) return;
  Serial.println("WiFi: connecting...");
  WiFi.disconnect();
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  nextTry = millis() + 10000;
}

void ensureMqtt() {
  if (WiFi.status() != WL_CONNECTED || mqtt.connected() || millis() < nextMqttTry) return;
  Serial.printf("MQTT: connecting to %s:%d...\n", MQTT_HOST, MQTT_PORT);
  if (mqtt.connect(MQTT_CLIENT_ID, MQTT_USERNAME, MQTT_PASSWORD)) {
    mqtt.subscribe(topic.c_str(), 0);
    Serial.printf("MQTT: subscribed %s\n", topic.c_str());
    mqttBackoff = 1000;
    // Two short blinks of both LEDs = connected.
    for (int i = 0; i < 2; i++) { setLeds(true, true); delay(120); setLeds(false, false); delay(120); }
  } else {
    Serial.printf("MQTT: failed rc=%d, retry in %lus\n", mqtt.state(), mqttBackoff / 1000);
    nextMqttTry = millis() + mqttBackoff;
    mqttBackoff = min(mqttBackoff * 2, 30000UL);
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_GREEN, OUTPUT);
  pinMode(PIN_RED, OUTPUT);
  setLeds(false, false);
  topic = String("campus/") + ROOM_CODE + "/gate/feedback";
  WiFi.mode(WIFI_STA);
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onMessage);
  mqtt.setKeepAlive(30);
}

void loop() {
  ensureWifi();
  ensureMqtt();
  mqtt.loop();
  if (ledOffAt && (long)(millis() - ledOffAt) >= 0) {
    setLeds(false, false);
    ledOffAt = 0;
  }
}
