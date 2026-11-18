# ESP32 door LED

Shows the gate result to the person at the door: **green 1.5 s** = recognised, **red 1.5 s** = not recognised
("please verify on your phone"). It only subscribes to `campus/<ROOM>/gate/feedback` (QoS 0); the edge publishes there.

## Parts and wiring

| ESP32 pin | Part |
|---|---|
| GPIO 25 | 220 Ω resistor -> green LED anode (long leg); cathode -> GND |
| GPIO 26 | 220 Ω resistor -> red LED anode (long leg); cathode -> GND |
| GND | both LED cathodes |

## Build and flash (Arduino IDE 2)

1. Boards Manager: install **esp32 by Espressif**; select **ESP32 Dev Module** and the COM port.
2. Library Manager: install **PubSubClient** (Nick O'Leary).
3. Copy `secrets.example.h` to `secrets.h` (gitignored) and fill in Wi-Fi, the laptop's LAN IP and the MQTT user.
4. Create the MQTT user on the laptop (prints the password once):
   `powershell -ExecutionPolicy Bypass -File scripts\new-device-key.ps1 -DeviceId <esp32 device id> -MqttUser esp32-B204`
   (the `esp32-B204` user is already in `infra/mosquitto/acl`, read-only on `campus/B204/gate/feedback`), then restart Mosquitto.
5. Upload, open the Serial Monitor at 115200: `MQTT: subscribed campus/B204/gate/feedback`, both LEDs blink twice.

The broker must listen on the LAN (`infra/mosquitto/mosquitto.conf`: `listener 1883 0.0.0.0`) and Windows Firewall
must allow inbound TCP 1883 on the private network.

Status: written for Phase 8; **not compiled or flashed in this repo** (no board available to the build) — verify on hardware.
