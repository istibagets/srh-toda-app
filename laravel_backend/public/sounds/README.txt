NOTIFICATION SOUND - DEFAULT DEVICE SOUND
=========================================

SRH LINK-TODA uses the DEFAULT notification sound of the phone / Chrome.

- When the app is open: the system notification banner is shown NON-SILENT,
  so Chrome/Android play their default notification sound.
- When the app is minimized or closed: the pushed notification also plays
  the default device sound.

There is NO custom audio file. This folder is intentionally empty.

Android note: the sound for a website's notifications is controlled by the
site's notification channel. If no sound plays, long-press one of the app's
notification banners -> Notification settings -> tap the site/Chrome entry ->
enable "Sound" (and "Vibrate"). After that, the default device sound rings
in every state.

iOS note: iOS Safari cannot show in-app banners; while the app is open it
uses a short built-in chime instead. Backgrounded/closed iPhones with
home-screen web push use the default system sound.