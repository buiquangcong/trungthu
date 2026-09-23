/* Mobile & Desktop Auto-play Music Engine */
(function() {
  "use strict";

  var defaultMusic = "/assets/music/vuonhoaconca.mp3";
  var baseVolume = 0.55;
  var currentSource = defaultMusic;
  var audio = null;
  var subscribers = new Set();
  var wantsPlay = true; // Auto-play enabled by default!
  var isUnlocked = false;
  var duckFactor = 1;
  var fadeTimer = 0;

  function getEffectiveVolume() {
    return Math.max(0, Math.min(1, baseVolume * duckFactor));
  }

  function notifySubscribers() {
    var playing = isPlaying();
    subscribers.forEach(function(fn) {
      try { fn(playing); } catch (e) {}
    });
  }

  function getAudio() {
    if (!audio) {
      audio = new Audio();
      audio.loop = true;
      audio.preload = "auto";
      audio.crossOrigin = "anonymous";
      audio.setAttribute("playsinline", "true");
      audio.setAttribute("webkit-playsinline", "true");
      audio.src = currentSource;
      audio.volume = getEffectiveVolume();

      audio.addEventListener("play", notifySubscribers);
      audio.addEventListener("playing", notifySubscribers);
      audio.addEventListener("pause", notifySubscribers);
      audio.addEventListener("ended", notifySubscribers);
      audio.addEventListener("error", function(e) {
        console.warn("Audio element warning:", e);
      });
    }
    return audio;
  }

  function isPlaying() {
    return !!audio && !audio.paused;
  }

  function fadeTo(targetVol, duration, onComplete) {
    var a = getAudio();
    clearInterval(fadeTimer);
    var startTime = performance.now();
    var startVol = a.volume;
    var dur = duration || 800;

    fadeTimer = setInterval(function() {
      var progress = Math.min(1, (performance.now() - startTime) / dur);
      var smooth = progress * progress * (3 - 2 * progress);
      a.volume = Math.max(0, Math.min(1, startVol + (targetVol - startVol) * smooth));
      if (progress >= 1) {
        clearInterval(fadeTimer);
        fadeTimer = 0;
        if (onComplete) onComplete();
      }
    }, 40);
  }

  function doPlay() {
    var a = getAudio();
    wantsPlay = true;
    a.volume = getEffectiveVolume();
    if (a.src !== currentSource && !currentSource.startsWith("blob:")) {
      a.src = currentSource;
      a.load();
    }
    var promise = a.play();
    if (promise !== undefined) {
      promise.then(function() {
        isUnlocked = true;
        notifySubscribers();
      }).catch(function(err) {
        // Autoplay blocked by browser policy until first touch
        console.log("Autoplay waiting for first touch:", err.message);
        notifySubscribers();
      });
    }
  }

  function doPause() {
    wantsPlay = false;
    if (audio) {
      audio.pause();
      notifySubscribers();
    }
  }

  // Automatic global gesture unlock: ANY user tap on the screen immediately starts audio if blocked
  function onFirstUserGesture() {
    if (wantsPlay) {
      var a = getAudio();
      if (a.paused) {
        a.volume = getEffectiveVolume();
        var p = a.play();
        if (p !== undefined) {
          p.then(function() {
            isUnlocked = true;
            notifySubscribers();
          }).catch(function() {});
        }
      }
    }
  }

  if (typeof window !== "undefined") {
    var gestureEvents = ["touchstart", "touchend", "pointerdown", "mousedown", "click", "keydown"];
    gestureEvents.forEach(function(ev) {
      window.addEventListener(ev, onFirstUserGesture, { capture: true, passive: true });
    });

    // Also attempt autoplay immediately as soon as page is loaded/interactive
    if (document.readyState === "complete" || document.readyState === "interactive") {
      setTimeout(doPlay, 100);
    } else {
      window.addEventListener("DOMContentLoaded", function() {
        setTimeout(doPlay, 100);
      });
    }
  }

  window.TTMusic = {
    setDuck: function(factor, duration) {
      duckFactor = Math.max(0, Math.min(1, typeof factor === "number" ? factor : 1));
      if (audio && !audio.paused) {
        fadeTo(getEffectiveVolume(), duration || 800);
      }
    },
    setSource: function(url, vol) {
      if (typeof vol === "number" && vol > 0) {
        baseVolume = Math.min(1, vol);
      }
      var clean = (url && String(url).trim()) || defaultMusic;
      currentSource = clean;
      if (audio) {
        audio.src = currentSource;
        audio.volume = getEffectiveVolume();
        if (wantsPlay) {
          audio.play().catch(function() {});
        }
      } else {
        doPlay();
      }
    },
    prepare: function() {
      doPlay();
    },
    unlock: function() {
      onFirstUserGesture();
    },
    play: function() {
      doPlay();
    },
    pause: function() {
      doPause();
    },
    toggle: function() {
      if (isPlaying()) {
        doPause();
      } else {
        doPlay();
      }
    },
    isPlaying: isPlaying,
    subscribe: function(fn) {
      subscribers.add(fn);
      // Immediately notify current state
      try { fn(isPlaying()); } catch(e) {}
      return function() {
        subscribers.delete(fn);
      };
    }
  };
})();
