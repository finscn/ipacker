var ImagePool=ImagePool||{};
(function(){

var _imgs={
  "1": {
    "img": "b",
    "frame": {
      "x": 0,
      "y": 0,
      "w": 124,
      "h": 173,
      "ox": 62,
      "oy": 92
    }
  },
  "2": {
    "img": "b",
    "frame": {
      "x": 124,
      "y": 0,
      "w": 146,
      "h": 158,
      "ox": 73,
      "oy": 67
    }
  }
};

for (var key in _imgs){ ImagePool[key]=_imgs[key]; }

})();