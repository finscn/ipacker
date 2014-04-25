var ImagePool=ImagePool||{};
(function(){

var _imgs={
  "1": {
    "img": "a",
    "frame": {
      "x": 322,
      "y": 0,
      "w": 183,
      "h": 199,
      "ox": 92,
      "oy": 99.5
    }
  },
  "2": {
    "img": "a",
    "frame": {
      "x": 129,
      "y": 0,
      "w": 193,
      "h": 274,
      "ox": 96.5,
      "oy": 137
    }
  },
  "3": {
    "img": "a",
    "frame": {
      "x": 0,
      "y": 0,
      "w": 129,
      "h": 324,
      "ox": 64.5,
      "oy": 162
    }
  },
  "4": {
    "img": "a",
    "frame": {
      "x": 0,
      "y": 324,
      "w": 154,
      "h": 138,
      "ox": 77,
      "oy": 65
    }
  }
};

for (var key in _imgs){ ImagePool[key]=_imgs[key]; }

})();