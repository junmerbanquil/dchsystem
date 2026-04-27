DCH CLINICAL CHART PWA SYSTEM - IMPROVED DATABASE VERSION

WHAT WAS IMPROVED
1. All forms save to one central SQLite database: dch.db
2. Records encoded from Android, laptop, or other PC are viewable on all devices.
3. Records page always reads from the server/database, not only from localStorage.
4. The system can still cache pages as PWA, but database requests are always live/network-first.
5. Old saved data from the previous dch.db format will auto-migrate on first server start.

HOW TO RUN
1. Extract this ZIP file.
2. Open the extracted folder.
3. Double-click START_SERVER.bat.
4. Keep the black server window open.
5. On the server PC, open: http://localhost:3000
6. On Android or other PC, open: http://SERVER-IP:3000
   Example: http://192.168.1.10:3000

ANDROID INSTALLATION
1. Connect Android to the same Wi-Fi/LAN as the server PC.
2. Open Chrome.
3. Go to http://SERVER-IP:3000
4. Tap the three dots menu.
5. Tap Add to Home screen or Install app.

IMPORTANT
- Do not open the HTML file directly by double-clicking it. Always use http://SERVER-IP:3000.
- If other devices cannot open it, allow Node.js or port 3000 in Windows Firewall.
- The server PC must be ON and START_SERVER.bat must be running.
- Data is saved in dch.db inside this folder. Back up dch.db regularly.
