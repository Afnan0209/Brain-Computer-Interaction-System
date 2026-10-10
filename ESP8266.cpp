void setup() {
  // Serial baud rate set to 115200 for fast transmission
  Serial.begin(115200);
}

void loop() {
  // Read analog signal from BioAmp connected to pin A0 (0 to 1023)
  int rawBioAmpSignal = analogRead(A0);
  
  // Send the exact value over Serial
  Serial.println(rawBioAmpSignal);
  
  // Sample roughly every 4ms (~250Hz rate)
  delay(4);
}