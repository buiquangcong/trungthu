/* Mobile-optimized music player with direct streaming & bulletproof iOS/Android unlock */
(function() {
  "use strict";

  var defaultMusic = "/assets/music/vuonhoaconca.mp3";
  var baseVolume = 0.55;
  var currentSource = defaultMusic;
  var audio = null;
  var fadeTimer = 0;
  var subscribers = new Set();
  var wantsPlay = false;
  var isUnlocked = false;
  var duckFactor = 1;

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
      audio.addEventListener("pause", notifySubscribers);
      audio.addEventListener("playing", notifySubscribers);
      audio.addEventListener("ended", notifySubscribers);
      audio.addEventListener("error", function(e) {
        console.warn("Audio element error, will retry:", e);
      });
    }
    return audio;
  }

  function isPlaying() {
    return !!audio && !audio.paused && audio.currentTime > 0;
  }

  function fadeTo(targetVol, duration, onComplete) {
    var a = getAudio();
    clearInterval(fadeTimer);
    var startTime = performance.now();
    var startVol = a.volume;
    var dur = duration || 1200;

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
    if (a.src !== currentSource && !currentSource.startsWith("blob:")) {
      a.src = currentSource;
      a.load();
    }
    var promise = a.play();
    if (promise !== undefined) {
      promise.then(function() {
        isUnlocked = true;
        fadeTo(getEffectiveVolume(), 2000);
      }).catch(function(err) {
        console.log("Autoplay waiting for user gesture:", err.message);
        setupUserGestureListener();
      });
    }
  }

  function setupUserGestureListener() {
    var events = ["touchstart", "touchend", "pointerdown", "click"];
    function onGesture() {
      events.forEach(function(ev) {
        window.removeEventListener(ev, onGesture, true);
      });
      if (wantsPlay) {
        var a = getAudio();
        if (a.paused) {
          var p = a.play();
          if (p !== undefined) {
            p.then(function() {
              isUnlocked = true;
              fadeTo(getEffectiveVolume(), 1500);
            }).catch(function() {
              // Retry on next touch if still denied
              setupUserGestureListener();
            });
          }
        }
      }
    }
    events.forEach(function(ev) {
      window.addEventListener(ev, onGesture, true);
    });
  }

  function doPause() {
    wantsPlay = false;
    if (audio) {
      fadeTo(0, 500, function() {
        audio.pause();
        notifySubscribers();
      });
    }
  }

  function unlock() {
    var a = getAudio();
    if (!isUnlocked) {
      // Direct synchronous unlock on touch
      var p = a.play();
      if (p !== undefined) {
        p.then(function() {
          isUnlocked = true;
          if (!wantsPlay) {
            // Keep playing if user already wants play, else pause
            a.pause();
            a.currentTime = 0;
          }
        }).catch(function() {});
      }
    }
  }

  // Global touch listener to ensure audio starts on any mobile tap once requested
  if (typeof window !== "undefined") {
    var unlockEvents = ["touchstart", "touchend", "pointerdown", "click"];
    unlockEvents.forEach(function(ev) {
      window.addEventListener(ev, function() {
        if (wantsPlay && audio && audio.paused) {
          audio.play().catch(function() {});
        }
      }, { capture: true, passive: true });
    });
  }

  window.TTMusic = {
    setDuck: function(factor, duration) {
      duckFactor = Math.max(0, Math.min(1, typeof factor === "number" ? factor : 1));
      if (audio && !audio.paused) {
        fadeTo(getEffectiveVolume(), duration || 900);
      }
    },
    setSource: function(url, vol) {
      if (typeof vol === "number" && vol > 0) {
        baseVolume = Math.min(1, vol);
      }
      var clean = (url && String(url).trim()) || defaultMusic;
      currentSource = clean;
      if (audio) {
        var wasPlaying = !audio.paused;
        audio.src = currentSource;
        audio.load();
        if (wasPlaying) {
          audio.play().catch(function() {});
        }
      }
    },
    prepare: function() {
      getAudio();
    },
    unlock: function() {
      unlock();
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
      return function() {
        subscribers.delete(fn);
      };
    }
  };
})();
