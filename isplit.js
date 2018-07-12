// plutil -convert xml1 file.plist
// xcrun -sdk iphoneos pngcrush -revert-iphone-optimizations -q Local.png Local-standard.png

"use strict";

var fs = require('fs');
var Path = require('path');
var cp = require('child_process');
var wrench = require('wrench');
var glob = require('glob');
var program = require('commander');

var plist = require('plist');

var cwd = process.env.PWD || process.cwd();
var outputDir = Path.normalize(cwd + "/output/");
outputDir = Path.resolve(cwd, outputDir);



var args = process.argv.slice(2);
var plistFile = args[0];
var imgFile = args[1];

var jsFile;
var jsonData;

var obj, frames, metadata;

var imgName = Path.basename(plistFile, ".plist");


function start(frames) {

    console.log(outputDir);
    console.log(imgFile);

    jsFile = Path.basename(plistFile, ".plist") + '.js';
    jsonData = {};
    console.log(jsFile);

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir);
    }

    var fileNameList = Object.keys(frames);
    fileNameList.sort();

    var index = -1;
    var total = fileNameList.length;
    var $next = function() {
        index++;
        // console.log(index + " / " + total);
        if (index >= total) {
            finish();
            return;
        }
        var fileName = fileNameList[index];
        var frameData = frames[fileName];
        parseFrame(fileName, frameData, function() {
            $next();
        });
    }
    $next();
}


// <key>frame</key>
// <string>{{1924,718},{96,96}}</string>
// <key>offset</key>
// <string>{0,0}</string>
// <key>rotated</key>
// <false/>
// <key>sourceColorRect</key>
// <string>{{0,0},{96,96}}</string>
// <key>sourceSize</key>
// <string>{96,96}</string>

function parseFrame(fileName, frameData, callback) {
    var frameRect = parseValue(frameData.frame);
    var offset = parseValue(frameData.offset);
    var sourceColorRect = parseValue(frameData.sourceColorRect);
    var sourceSize = parseValue(frameData.sourceSize);
    var rotated = parseValue(frameData.rotated);

    var left = frameRect[0][0];
    var top = frameRect[0][1];
    var width = frameRect[1][0];
    var height = frameRect[1][1];

    var data = {
        img: imgName,
        x: left,
        y: top,
        w: width,
        h: height,
        ox:offset[0],
        oy:offset[1],
    };
    jsonData[fileName] = data;

    if (!imgFile) {
        if (callback) {
            setTimeout(function() {
                callback();
            }, 1);
        }
        return;
    }

    if (fileName.indexOf(".png") == -1) {
        fileName += ".png";
    }

    var fileDir = outputDir;
    var parts = fileName.split("_");

    if (parts.length > 1) {
        fileDir += "/" + parts[0];
        if (!fs.existsSync(fileDir)) {
            fs.mkdirSync(fileDir);
        }
        if (parts.length > 2) {
            fileDir += "/" + parts[1];
            if (!fs.existsSync(fileDir)) {
                fs.mkdirSync(fileDir);
            }
        }
    }

    var filePath = Path.normalize(fileDir + "/" + fileName);
    cropImage(imgFile, left, top, width, height, filePath, function() {
        if (callback) {
            callback();
        }
    });
}
// convert 原始图片 -crop widthxheight+x+y 目标图片

function cropImage(sourceImage, x, y, width, height, destImage, callback) {
    var cmd = ['convert',
        sourceImage,
        '-crop',
        width + 'x' + height + "+" + x + '+' + y,
        destImage
    ];
    callCmd(cmd.join(' '), function(err, stdout) {
        console.log(destImage, "ok");
        if (err) {
            // console.log(err);
        }
        if (callback) {
            callback();
        }
    });
}

// plutil -convert xml1 file.plist
function convertPlist(plistFile, callback) {
    var cmd = ['plutil',
        '-convert',
        'xml1',
        plistFile
    ];
    callCmd(cmd.join(' '), function(err, stdout) {
        console.log(plistFile, "ok");
        if (err) {
            // console.log(err);
        }
        if (callback) {
            callback();
        }
    });
}

// // xcrun -sdk iphoneos pngcrush -revert-iphone-optimizations -q Local.png Local-standard.png
function convertPng(pngFile, callback) {
    var tempPng = pngFile + "_temp.png";
    fs.renameSync(pngFile, tempPng);
    var cmd = ['xcrun -sdk iphoneos pngcrush',
        '-revert-iphone-optimizations',
        '-q',
        tempPng,
        pngFile
    ];
    callCmd(cmd.join(' '), function(err, stdout) {
        console.log(pngFile, "ok");
        if (err) {
            // console.log(err);
        }

        if (fs.existsSync(pngFile)) {
            fs.unlinkSync(tempPng);
        } else {
            fs.renameSync(tempPng, pngFile);
        }

        if (callback) {
            callback();
        }
    });
}

function callCmd(cmd, cb) {
    // console.log(cmd)
    cp.exec(cmd, function(err, stdout, stderr) {
        // console.log(cmd);
        err = err || stderr;
        if (err) {
            console.log(cmd)
            console.log(err);
            // return;
        }
        cb && cb(err, stdout);
    });
}

function parseValue(value) {
    if (typeof value == "string") {
        value = eval(value.replace(/\{/g, "[").replace(/\}/g, "]"));
    }
    return value;
}

function finish() {

    var jsonCode = JSON.stringify(jsonData, null, 4);
    var jsCode = [
        'var ImageMapping = ImageMapping || {};',
        '(function() {',
        'var _imgs = ' + jsonCode + ';',
        'for (var key in _imgs) { ImageMapping[key] = _imgs[key]; }',
        '})();',
    ].join('\n');
    // console.log(jsCode);
    fs.writeFileSync(outputDir + '/' + jsFile, jsCode, 'utf8');
}


convertPlist(plistFile, function() {
    obj = plist.parse(fs.readFileSync(plistFile, 'utf8'));
    frames = obj.frames;
    metadata = obj.metadata;
    // imgFile = imgFile || metadata.realTextureFileName || metadata.textureFileName;
    console.log('Image in config', metadata.realTextureFileName || metadata.textureFileName);
    if (imgFile) {
        convertPng(imgFile, function() {
            start(frames);
        });
    } else {
        start(frames);
    }
});
