var fs = require('fs');
var $path = require('path');
var $plist = require('plist');

var cwd = process.env.PWD || process.cwd();
var outputDir = $path.normalize(cwd + "/output/");
outputDir = $path.resolve(cwd, outputDir);


var args = process.argv.slice(2);
var plistFile = args[0];

var obj = $plist.parse(fs.readFileSync(plistFile, 'utf8'));
var anims = obj;

start(anims);

function start(anims) {

    console.log(outputDir);

    jsFile = $path.basename(plistFile, ".plist") + '.js';
    jsonData = {};
    console.log(jsFile);

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir);
    }

    var animNameList = Object.keys(anims);
    animNameList.sort();

    var index = -1;
    var total = animNameList.length;
    var $next = function() {
        index++;
        // console.log(index + " / " + total);
        if (index >= total) {
            finish();
            return;
        }
        var animName = animNameList[index];
        var animData = anims[animName];
        parseNode(animName, animData, function() {
            $next();
        });
    }
    $next();
}


function parseNode(nodeName, nodeData, callback) {
    // console.log(nodeName, nodeData);
    var frames = nodeData.frames;

    var data = {
        frames: [],
    };
    jsonData[nodeName] = data;

    frames.forEach(function(frame) {
        var _f = {
            imgName: frame.frame
        };
        data.frames.push(_f);
    });

    if (callback) {
        setTimeout(function() {
            callback();
        }, 1);
    }
}

function finish() {

    var jsonCode = JSON.stringify(jsonData, null, 4);
    var jsCode = [
        'var AnimationMapping = AnimationMapping || {};',
        '(function() {',
        'var _anims = ' + jsonCode + ';',
        'for (var key in _anims) { AnimationMapping[key] = _anims[key]; }',
        '})();',
    ].join('\n');
    // console.log(jsCode);
    fs.writeFileSync(outputDir + '/' + jsFile, jsCode, 'utf8');
}
