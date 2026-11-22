/* 📲 PWA-Service-Worker (Carnival of Monsters, v3.5)
   ----------------------------------------------------------------------------
   Dieser Worker existiert NUR, weil Chrome und Android ihn als Eintrittskarte
   für die App-Installation sehen wollen. Der Worker speichert absichtlich
   NICHTS: Jede Anfrage geht ungehindert ans Netz. Dadurch bekommt die App beim
   nächsten Start garantiert die neueste Version vom Server – es gibt KEINE
   Versionsnummern zu pflegen und NIEMALS das Problem „aktualisiert nicht".
----------------------------------------------------------------------------- */
self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  /* absichtlich leer: kein respondWith, kein Cache – reine Passstrecke */
});
