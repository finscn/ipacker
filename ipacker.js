"use strict";

var fs = require('fs');
var cp = require('child_process');
var Path = require('path');
var fsExt = require('fs-extra');
var glob = require('glob');
var program = require('commander');
var plist = require('plist');


var GrowingPacker = require('./lib/packer.growing').GrowingPacker;

var MAX_PACK_WIDTH = 2048;
var MAX_PACK_HEIGHT = 2048;

var MAX_DIR_DEPTH = 10;
var matchOperatorsRe = /[|\\{}()[\]^$+*?.]/g;

function escapeRegExp(str) {
    return str.replace(matchOperatorsRe, '\\$&');
}

var Config = {
    scale: "100%",
    borderWidth: 0,
    anchorX: 0,
    anchorY: 0,
    flipX: false,
    flipY: false,
    split: "-",
    packName: "all_pack",
    trimName: "all_trim",
    packBgColor: "transparent",
    imgFileExtName: ".png",
    cfgFileExtName: ".txt",
    optipng: false,
    resDir: "res/image/",
    dirPart: 2,
};

var borderArgument;
var inputDir;
var outputDir;
var scaleOutputDir;
var trimOutputDir;
var packOutputDir;
var imgMappingDir;
var imgTrimMappingDir;

var inputFiles;


if (!module.parent) {

    if (main(process.argv) === false) {
        process.exit();
    }
}

function main(argv) {
    program
        .version('0.5')
        .option('-i --input [string]', 'input dir name')
        .option('-o --output [string]', 'output dir name')
        .option('-s --scale [number/percent]', 'scale all images')
        .option('-t --trim [trim color]', "trim all images, default trim color is transparent")
        // .option("-a --alpha [string]", "packed file's name")
        .option('-p --pack [string]', 'pack by a part of nameParts: 0,1,2,3,4... .\n\t "all"/empty means all-in-one')
        .option('--pack-pattern [string]', 'the pattern of packed file name: {fullDir},{firstDir},{dir[0...]},{lastDir},{name}')
        .option('--pattern [string]', 'the pattern of packed key: {fullDir},{firstDir},{dir[0...]},{lastDir},{name}')
        .option("-n --name [string]", "packed config file's name")
        .option("-r --root [string]", "relative path root")
        .option('-m --margin [int number]', "the margin of one image")
        .option('--flipX', "flipX images")
        .option('--flipY', "flipY images")
        .option('--anchor [boolean]', "keep anchor information", false)
        .option('--anchorX [number/percent]', "the anchor X in source images. number means n pixel.\n\t percent(e.g. 35%) means the position of width")
        .option('--anchorY [number/percent]', "the anchor Y in source images. number means n pixel.\n\t percent(e.g. 35%) means the position of height")
        .option('--keep [boolean]', 'keep source size information', true)
        .option('--split [string]', 'file-part split char')
        .option('--shadow [string]', 'shadow-file')
        .option('--configOnly', "create config file only")
        .option('--plist', "use plist")
        .option('--json', "use json")
        .option('--mipmap', "use mipmap")
        // .option('--size [string]', "packed file's size: width,height")
        .option('--maxSize [string]', "packed file's max-size: width,height")

        .parse(argv);

    if (argv.length < 3) {
        program.help();
        return false;
    }

    inputDir = Path.normalize((program.input || "./input/") + "/");
    outputDir = Path.normalize((program.output || "./output/") + "/");

    scaleOutputDir = Path.normalize(outputDir + "/scale/");
    trimOutputDir = Path.normalize(outputDir + "/trim/");
    packOutputDir = Path.normalize(outputDir + "/pack/");
    imgMappingDir = Path.normalize(packOutputDir + "/img-mapping/");
    imgTrimMappingDir = Path.normalize(trimOutputDir + "/img-mapping/");

    (function() {
        var scale = program.scale;
        var trimBy = program.trim;
        var packBy = program.pack;
        var packPattern = program.packPattern;
        var pattern = program.pattern;
        var shadow = program.shadow;
        var name = program.name;
        var root = program.root;

        var anchor = program.anchor;
        var keep = program.keep;

        var configOnly = program.configOnly || false;
        var borderWidth = parseInt(program.margin || 0, 10);
        var plist = program.plist || false;
        var json = program.json || false;
        var mipmap = program.mipmap || false;

        // var packageWidth = parseInt(program.width, 10) || 64; // 64 128 256 512 1024 2048
        // var packageHeight = parseInt(program.height, 10) || 64;
        var maxWidth = MAX_PACK_WIDTH;
        var maxHeight = MAX_PACK_HEIGHT;
        if (program.maxSize) {
            var maxSize = program.maxSize.split(",");
            if (maxSize.length < 2) {
                maxSize = program.maxSize.split("*");
            }
            if (maxSize.length < 2) {
                maxSize = program.maxSize.split("*");
            }
            if (maxSize.length < 2) {
                maxSize[1] = maxSize[0];
            }
            maxWidth = parseInt(maxSize[0], 10);
            maxHeight = parseInt(maxSize[1], 10);
        }

        trimBy = trimBy === true ? "transparent" : (trimBy || false);

        packBy = packBy === true ? "all" : packBy;

        packPattern = packPattern || "";
        pattern = pattern || "";
        root = root || "";

        shadow = shadow === true ? "shadow.png" : shadow;
        if (shadow) {
            shadow = Path.normalize(shadow);
        }

        var _config = {
            scale: scale || Config.scale,
            trimBy: trimBy,
            packBy: packBy,
            packPattern: packPattern,
            pattern: pattern,
            packName: name || Config.packName,
            trimName: name || Config.trimName,
            root: root,
            borderWidth: borderWidth || Config.borderWidth,
            // packageWidth: packageWidth,
            // packageHeight: packageHeight,
            doPack: !configOnly,
            doScale: !configOnly,
            doTrim: !configOnly,
            split: program.split || Config.split,
            anchor: anchor,
            anchorX: program.anchorX || Config.anchorX, //"50%",
            anchorY: program.anchorY || Config.anchorY, //"50%",
            flipY: program.flipY || Config.flipX, //"50%",
            flipX: program.flipX || Config.flipY, //"50%",
            keep: keep,
            plist: plist,
            json: json,
            mipmap: mipmap,
            maxWidth: maxWidth,
            maxHeight: maxHeight,
        };

        for (var key in _config) {
            Config[key] = _config[key];
        }

    }());


    borderArgument = '-border ' + Config.borderWidth + 'x' + Config.borderWidth;

    console.log("\n");
    console.log("==== iPacker is working ====");

    inputFiles = getFiles(inputDir);

    if (Config.scale !== "100%") {
        if (Config.doScale) {
            cleanDir(scaleOutputDir);
            startScale(function() {
                var scaledFiles = getFiles(scaleOutputDir);
                inputDir = scaleOutputDir;
                start(scaledFiles);
            });
        } else {
            var scaledFiles = getFiles(scaleOutputDir);
            inputDir = scaleOutputDir;
            start(scaledFiles);
        }
    } else {
        start(inputFiles);
    }
}

function start(files) {

    if (Config.doTrim && Config.trimBy) {
        cleanDir(trimOutputDir);
    }
    if (Config.doPack && Config.packBy) {
        cleanDir(packOutputDir);
    }

    files = files || inputFiles;

    startParse(files, function(filesInfo) {
        if (Config.packBy && Config.trimBy) {
            startTrim(filesInfo.list, function(fileInfoList, trimFilesInfo) {
                startPack(fileInfoList, function(fileInfoList, packGroupInfo) {
                    createPackMapping(fileInfoList, packGroupInfo);
                    fsExt.removeSync(imgTrimMappingDir);
                });
            });
        } else if (Config.packBy) {
            startPack(filesInfo.list, function(fileInfoList, packGroupInfo) {
                createPackMapping(fileInfoList, packGroupInfo);
                fsExt.removeSync(imgTrimMappingDir);
            });
        } else if (Config.trimBy) {
            startTrim(filesInfo.list, function(fileInfoList, trimFilesInfo) {
                createMappingJS(fileInfoList, packGroupInfo, true);
            });
        }
    });
}



function createPackMapping(infoList, packGroupInfo) {
    if (Config.plist) {
        createMappingPlist(infoList, packGroupInfo);
        if (Config.json) {
            createMappingJS(infoList, packGroupInfo, false);
        }
    } else {
        createMappingJS(infoList, packGroupInfo, false);
    }
}

function createMappingPlist(infoList, packGroupInfo) {

    if (infoList.length < 1) {
        console.log("==== Nothing to do ====");
        return;
    }

    var k = Config.keep;

    for (var packBy in packGroupInfo) {
        var group = packGroupInfo[packBy];
        if (!group.packedFileSize) {
            continue;
        }

        var w = group.packedFileSize[0];
        var h = group.packedFileSize[1];

        var textureFileName = Path.basename(group.packedFile);

        var mapping = {
            "frames": {},
            "metadata": {
                "format": 3,
                "pixelFormat": "RGBA8888",
                "premultiplyAlpha": false,
                "realTextureFileName": textureFileName,
                "size": "{" + [w, h] + "}",
                "textureFileName": textureFileName,
            }
        };

        group.forEach(function(info) {

            if (info.imageInfo) {
                var imgInfo = info.imageInfo;
                var fileName = Path.basename(info.imgFile);
                var x = imgInfo.x + Config.borderWidth;
                var y = imgInfo.y + Config.borderWidth;
                var w = imgInfo.w - Config.borderWidth * 2;
                var h = imgInfo.h - Config.borderWidth * 2;
                var f = {
                    "aliases": [],
                    "textureRotated": false,
                    "spriteOffset": "{" + [imgInfo.ox, imgInfo.oy] + "}",
                    "spriteSize": "{" + [w, h] + "}",
                    "spriteSourceSize": "{" + [imgInfo.sw, imgInfo.sh] + "}",
                    "textureRect": "{{" + [x, y] + "},{" + [w, h] + "}}",
                };
                mapping.frames[fileName] = f;
            }

        });

        var mappingFile = Path.normalize(imgMappingDir + Config.packName + ".plist");
        var code = plist.build(mapping);

        fs.writeFileSync(mappingFile, code);

        console.log("==== Mapping-file created : " + mappingFile + " ====");
    }

    console.log("\n");

}


function createMappingJS(infoList, packGroupInfo, trimOnly) {

    if (infoList.length < 1) {
        console.log("==== Nothing to do ====");
        return;
    }

    var k = Config.keep;

    var sourceList = [];
    var mapping = {};

    for (var packBy in packGroupInfo) {
        var group = packGroupInfo[packBy];
        if (!group.packedFileSize) {
            continue;
        }

        group.forEach(function(info) {
            sourceList.push({
                id: info.patternName,
                src: (Config.root ? Config.root + "/" : "") + info.relativePath,
            });
            if (info.imageInfo) {
                var imgInfo = info.imageInfo;
                var f = {
                    img: trimOnly ? info.baseName : info.packBy,
                    // source: info.relativePath,
                    x: imgInfo.x + Config.borderWidth,
                    y: imgInfo.y + Config.borderWidth,
                    w: imgInfo.w - Config.borderWidth * 2,
                    h: imgInfo.h - Config.borderWidth * 2,
                    ox: k ? imgInfo.ox : 0,
                    oy: k ? imgInfo.oy : 0,
                    sw: k ? imgInfo.sw : imgInfo.w,
                    sh: k ? imgInfo.sh : imgInfo.h,
                };
                if (Config.anchor) {
                    f.anchor = imgInfo.anchor;
                }
                mapping[info.patternName] = f;
            }
        });

    }

    if (sourceList.length < 1) {
        console.log("\n");
        return;
    }

    var extName = Config.json ? ".json" : ".js";

    var mappingFile;
    var resourceFile;

    if (trimOnly) {
        mappingFile = Path.normalize(imgTrimMappingDir + Config.trimName + extName);
        resourceFile = Path.normalize(imgTrimMappingDir + "resource.json");
    } else {
        mappingFile = Path.normalize(imgMappingDir + Config.packName + extName);
        resourceFile = Path.normalize(imgMappingDir + "resource.json");
    }

    var code = JSON.stringify(mapping, function(k, v) {
        return v
    }, 2);

    if (!Config.json) {
        var codeStart = "var ImageMapping=ImageMapping||{};\n(function(){";
        // var codeEnd = "Image.merge(ImageMapping,_imgs);\n}());";
        var codeEnd = "for(var key in _imgs){ImageMapping[key]=_imgs[key];}\n})();";
        var outputStr = "var _imgs=" + code + ";";
        code = codeStart + "\n" + outputStr + "\n" + codeEnd;
    }

    fs.writeFileSync(mappingFile, code);

    // console.log("\n");
    console.log("==== Mapping-file created : " + mappingFile + " ====");

    var json = [];
    sourceList.forEach(function(s) {
        json.push('  { id: "' + s.id + '", src: "' + s.src + '" }')
    })
    json = '[\n' + json.join(',\n') + '\n]\n';
    fs.writeFileSync(resourceFile, json);

    // console.log("\n");
    console.log("==== Resource-file created : " + resourceFile + " ====");

    console.log("\n");

}



function createImagesTree(fileInfoList) {

    var tree = {};
    var root = tree;
    if (Config.packBy === "all") {
        root = tree[Config.packName] = {};
    }

    fileInfoList.forEach(function(info) {
        var parts = info.parts;
        var obj = root;
        for (var i = 0; i < parts.length; i++) {
            key = parts[i];
            obj = obj[key] = obj[key] || {};
        }
        // obj.img = info.packBy;
        obj.origName = info.baseName;
        if (info.imageInfo) {
            var f = {
                img: info.packBy,
                x: info.imageInfo.x,
                y: info.imageInfo.y,
                w: info.imageInfo.w,
                h: info.imageInfo.h,
                ox: info.imageInfo.ox,
                oy: info.imageInfo.oy
            }
            obj.frame = f;
        }
    });

    return tree;

}


function createJS(tree) {
    var keys = Object.keys(tree);
    if (keys.length < 1) {
        console.log("==== Nothing to do ====");
        return;
    }
    console.log("\n\n");

    var codeStart = "var ImagePool=ImagePool||{};\n(function(){";
    // var codeEnd = "Image.merge(ImagePool,_imgs);\n}());";
    var codeEnd = "for(var key in _imgs){ImagePool[key]=_imgs[key];}\n})();";

    var config;
    for (var key in tree) {
        if (Config.packBy === "all") {
            config = tree[key];
        } else {
            config = {};
            config[key] = tree[key];
        }
        var outputStr = "var _imgs=" + JSON.stringify(config, function(k, v) {
            return v
        }, 2) + ";";
        var code = codeStart + "\n" + outputStr + "\n" + codeEnd;

        var js = Path.normalize(imgMappingDir + key + ".js");
        fs.writeFileSync(js, code);

        console.log("{id: \"" + key + "\", src: \"" + Config.resDir + key + Config.imgFileExtName + "\" },");
    }
    console.log("\n\n");


    for (var key in tree) {
        console.log('<script src="../output/pack/img-mapping/' + key + '.js"></script>');
    }
    console.log("<script>var ResList=[");
    for (var key in tree) {
        console.log("{id: \"" + key + "\", src: \"../output/pack/" + key + Config.imgFileExtName + "\" },");
    }
    console.log("];</script>");


    console.log("\n\n");
    console.log("==== Done ====");

}


function startParse(fileList, cb) {

    var filesInfo = {
        list: [],
        map: {}
    };

    var count = fileList.length;
    var idx = -1;
    var $next = function() {
        idx++;
        if (idx >= count) {
            cb && cb(filesInfo);
            return;
        }
        var file = fileList[idx];
        var info = {
            orignalFile: file,
            file: null
        };
        filesInfo.list.push(info);
        filesInfo.map[info.orignalFile] = info;
        var parsedInfo = parseOrignalFileName(info.orignalFile, Config.packBy);
        overide(info, parsedInfo);
        info.imageInfo = {
            x: 0,
            y: 0,
            imgFile: info.imgFile
        };
        var imageInfo = info.imageInfo;
        readImageSize(info.orignalFile, function(w, h) {
            imageInfo.w = w;
            imageInfo.h = h;
            imageInfo.ox = 0;
            imageInfo.oy = 0;
            imageInfo.sw = w;
            imageInfo.sh = h;

            computeImageSize(imageInfo, info.orignalFile);

            $next();
        });
    }
    $next();

    return filesInfo;
}


function parsePattern(pattern, key, value) {
    var keyReg = escapeRegExp(key);
    var reg = new RegExp("\{[^\{\}]*" + keyReg + "[^\{\}]*\}", 'g');
    var match = pattern.match(reg);
    if (value === true || value === undefined) {
        return match;
    }
    // console.log(pattern, key, value, reg, match)

    if (match) {
        match.forEach(function(sub) {
            var idx = pattern.indexOf(sub);
            if (value) {
                var before = pattern.substring(0, idx);
                var after = pattern.substring(idx + sub.length);
                var newSub = sub.replace(key, value);
                newSub = newSub.substring(1, newSub.length - 1);
                pattern = before + newSub + after;
            } else {
                pattern = pattern.replace(sub, '');
            }
        });
    }
    return pattern;
}

function parsePatternWithDirs(pattern, dirs) {
    var dirCount = dirs.length;
    var fullDir = dirs.join(Config.split) || "";
    var firstDir = dirs[0] || "";
    var lastDir = dirs[dirCount - 1] || "";

    var hasIndex = {};
    for (var i = 0; i < MAX_DIR_DEPTH; i++) {
        var k = 'dir[' + i + ']';
        if (parsePattern(pattern, k)) {
            hasIndex[i] = true;
        }
        pattern = parsePattern(pattern, k, dirs[i] || "");
    }

    pattern = parsePattern(pattern, 'fullDir', fullDir);

    if (hasIndex[0]) {
        pattern = parsePattern(pattern, 'firstDir', "");
    } else {
        pattern = parsePattern(pattern, 'firstDir', firstDir);
    }

    if (hasIndex[dirCount - 1]) {
        pattern = parsePattern(pattern, 'lastDir', "");
    } else {
        pattern = parsePattern(pattern, 'lastDir', lastDir);
    }

    return pattern;
}

function parseOrignalFileName(orignalFile, packBy) {
    // var dirName = Path.dirname(orignalFile) || "";
    // dirName = Path.relative(inputDir, dirName) || "";
    var relativePath = Path.relative(inputDir, orignalFile) || "";
    var dirName = Path.dirname(relativePath) || "";
    var dirs = dirName.split(Path.seq);
    var dirCount = dirs.length;
    var fullDir = dirs.join(Config.split) || "";
    var firstDir = dirs[0] || "";
    var lastDir = dirs[dirCount - 1] || "";

    var extName = Path.extname(orignalFile);
    var baseName = Path.basename(orignalFile, extName);
    var fileParts = baseName.split(Config.split);
    var filePartCount = fileParts.length;

    var patternName;
    var pattern = Config.pattern;

    if (pattern) {

        pattern = parsePatternWithDirs(pattern, dirs);

        patternName = parsePattern(pattern, 'name', baseName);
        if (pattern === patternName) {
            patternName += baseName;
        }
    } else {
        patternName = baseName;
    }

    var packPattern = Config.packPattern;
    if (packPattern) {
        packPattern = parsePatternWithDirs(packPattern, dirs);
    }

    var info = {
        parts: [],
        orignalFile: orignalFile,
        relativePath: relativePath,
        baseName: baseName,
        patternName: patternName,
        packPattern: packPattern,
        fullDir: fullDir,
        firstDir: firstDir,
        lastDir: lastDir,
    };
    var imgFile = orignalFile;
    if (extName === Config.cfgFileExtName) {
        var realImg = fs.readFileSync(orignalFile).toString().trim();
        imgFile = Path.normalize(Path.dirname(orignalFile) + "/" + realImg);
    }
    info.imgFile = imgFile;

    packBy = (packBy || packBy === 0) ? packBy : Config.packBy;

    if (packBy === "all") {
        info.packBy = Config.packName;
        info.parts = [baseName];
    } else if (packBy === 'fullDir') {
        info.packBy = (info.packPattern || info.fullDir || Config.packName) //+ Config.imgFileExtName;
        // info.parts = [baseName];
        info.parts = [info.packBy, baseName];
    } else if (packBy === 'firstDir') {
        info.packBy = (info.packPattern || info.firstDir || Config.packName) //+ Config.imgFileExtName;
        // info.parts = [baseName];
        info.parts = [info.packBy, baseName];
    } else if (packBy === 'lastDir') {
        info.packBy = (info.packPattern || info.lastDir || Config.packName) //+ Config.imgFileExtName;
        // info.parts = [baseName];
        info.parts = [info.packBy, baseName];
    } else if (packBy === '0') {
        // TODO
    } else {
        var packByInt = parseInt(packBy, 10) || 1;
        var p = [];
        for (var i = 0; i < packBy; i++) {
            if (i >= filePartCount) {
                break;
            }
            p.push(fileParts[0]);
            fileParts.shift();
        }
        info.packBy = p.join(Config.split);
        info.parts = [info.packBy].concat(fileParts);
    }
    return info;
}



function startPack(fileInfoList, cb) {

    cleanDir(imgMappingDir);

    var packGroupInfo = {};
    var packTrimInfo = {};

    fileInfoList.forEach(function(_info, idx) {
        var list = packGroupInfo[_info.packBy] = packGroupInfo[_info.packBy] || [];
        list.push(_info);

        var imgInfoList = packTrimInfo[_info.packBy] = packTrimInfo[_info.packBy] || [];
        imgInfoList.push(_info.imageInfo);
        _info.imageInfo._index = idx;
    });

    for (var packBy in packTrimInfo) {
        var imgInfoList = packTrimInfo[packBy];
        var packedFile = Path.normalize(packOutputDir + "/" + packBy + Config.imgFileExtName);
        var packedFileSize = preparePackImages(imgInfoList);
        var _info = packGroupInfo[packBy];
        _info.packedFile = packedFile;
        _info.packedFileSize = packedFileSize;
    }

    if (Config.doPack) {
        var keys = Object.keys(packGroupInfo);
        var count = keys.length;

        var idx = -1;
        var $next = function() {
            idx++;
            if (idx >= count) {
                cb && cb(fileInfoList, packGroupInfo);
                return;
            }
            var packBy = keys[idx];
            var _info = packGroupInfo[packBy];
            var imgInfoList = packTrimInfo[packBy];
            var packedFile = _info.packedFile;
            var packedFileSize = _info.packedFileSize;
            if (packedFileSize) {
                packImages(imgInfoList, packedFileSize, packedFile, function() {
                    $next();
                });
            } else {
                console.error("Can't pack " + packedFile + " : images are too many or too big.\n" +
                    "    The packed maxSize is " + Config.maxWidth + "," + Config.maxHeight + ".");
                $next();
            }
        }
        $next();
    } else {
        cb && cb(fileInfoList, packGroupInfo);
    }
}



function startTrim(fileInfoList, cb) {

    cleanDir(imgTrimMappingDir);

    var trimFilesInfo = {
        list: [],
        map: {},
    };

    var count = fileInfoList.length;
    var idx = -1;
    var $next = function() {
        idx++;
        if (idx >= count) {

            if (Config.doTrim) {
                trimImages(trimFilesInfo.list, function(trimedFiles) {
                    cb && cb(fileInfoList, trimFilesInfo);
                });

            } else {
                fileInfoList.forEach(function(_info) {

                });
                cb && cb(fileInfoList, trimFilesInfo);
            }
            return;
        }

        var info = fileInfoList[idx];

        if (info.imgFile) {
            if (!trimFilesInfo.map[info.imgFile]) {
                trimFilesInfo.map[info.imgFile] = [];
                trimFilesInfo.list.push(info.imgFile)
            }
            trimFilesInfo.map[info.imgFile].push(info);

            computeTrimInfo(info.imgFile, function(imageInfo) {

                // the information of
                imageInfo.ox -= Config.borderWidth;
                imageInfo.oy -= Config.borderWidth;
                imageInfo.sw -= Config.borderWidth * 2;
                imageInfo.sh -= Config.borderWidth * 2;

                computeImageSize(imageInfo, info.imgFile);
                info.imageInfo = imageInfo;
                $next();
            });
        }
    }
    $next();

}



function startScale(cb) {

    scaleImages(inputFiles, Config.scale, function(scale) {
        cb && cb();
    });
}

function startAddShadow(cb) {

    addShadows(inputFiles, Config.shadow, function() {
        console.log("==== all shadows added ====");
        cb && cb();
    });
}




////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////

var SortImageRule = {
    "maxHeightFirst": function(a, b) {
        var d = b.h - a.h;
        d = d ? d : b.w - a.w;
        return d ? d : b.index - a.index;
    },
    "maxWidthFirst": function(a, b) {
        var d = b.w - a.w;
        d = d ? d : b.h - a.h;
        return d ? d : b.index - a.index;
    },
    "maxSideFirst": function(a, b) {
        var d = Math.max(b.w, b.h) - Math.max(a.w, a.h);
        d = d ? d : b.h - a.h;
        d = d ? d : b.w - a.w;
        return d ? d : b.index - a.index;
    },
    "maxAreaFirst": function(a, b) {
        var d = b.w * b.h - a.w * a.h;
        d = d ? d : b.h - a.h;
        return d ? d : b.index - a.index;
    }
};

function preparePackImages(imgInfoList, width, height, space) {
    var maxWidth = width || Config.maxWidth;
    var maxHeight = height || Config.maxHeight;
    space = space || 0;

    imgInfoList.forEach(function(info) {
        // delete info.fit;
        info.w += space;
        info.h += space;
        if (info.w > maxWidth) {
            maxWidth = info.w;
        }
        if (info.h > maxHeight) {
            maxHeight = info.h;
        }
    });

    var packedAllList = [];
    var packed, unpacked, width, height;
    var sn = 0;
    for (var key in SortImageRule) {
        var fn = SortImageRule[key];
        imgInfoList.sort(fn);
        var packInfo = computePackInfo(imgInfoList, maxWidth, maxHeight);
        unpacked = packInfo[1];
        if (unpacked) {
            continue;
        }
        packed = packInfo[0];
        width = packInfo[2];
        height = packInfo[3];
        var binWidth = Math.pow(2, Math.ceil(Math.log(width) / Math.log(2)));
        var binHeight = Math.pow(2, Math.ceil(Math.log(height) / Math.log(2)));
        packedAllList.push([packed, unpacked, width, height, width * height, binWidth * binHeight, sn++, key]);
    }

    if (packedAllList.length < 1) {
        return null;
    }

    packedAllList.sort(function(a, b) {
        var binAreaA = a[5],
            binAreaB = b[5];
        var areaA = a[4],
            areaB = b[4];
        var d = binAreaA - binAreaB;
        d = d ? d : areaA - areaB;
        d = d ? d : a[3] - b[3];
        d = d ? d : a[6] - b[6];
        return d;
    });

    var bestRule = packedAllList[0];
    packed = bestRule[0];
    unpacked = bestRule[1];
    width = bestRule[2];
    height = bestRule[3];

    var ruleName = bestRule[7];

    packed.forEach(function(p, idx) {
        var f = p[0],
            fit = p[1];
        f.fit = null;
        f.x = fit.x;
        f.y = fit.y;
        f.inRight = fit.inRight;
        f.inDown = fit.inDown;
        f.index = fit.index;
        packed[idx] = f;
    });

    return [width, height, ruleName];
}

function computePackInfo(imgInfoList, maxWidth, maxHeight) {
    var out = false;
    for (var n = 0; n < imgInfoList.length; n++) {
        var f = imgInfoList[n];
        delete f.fit;
    }
    var packer = new GrowingPacker(maxWidth, maxHeight);
    packer.fit(imgInfoList);

    var packed = [];
    var unpacked = [];
    for (var n = 0; n < imgInfoList.length; n++) {
        var f = imgInfoList[n];
        if (f.fit) {
            packed.push([f, f.fit]);
        } else {
            unpacked.push(f);
        }
    }
    return [packed, unpacked.length > 0 ? unpacked : null, packer.root.w, packer.root.h];
}


function packImages(imgInfoList, size, outputFile, cb) {

    var width = size[0],
        height = size[1];
    var ruleName = size[2];

    if (Config.mipmap) {
        width = Math.pow(2, Math.ceil(Math.log(width) / Math.log(2)));
        height = Math.pow(2, Math.ceil(Math.log(height) / Math.log(2)));
    }

    var cmd = ['magick convert',
        '-size',
        width + 'x' + height,
        'xc:"' + Config.packBgColor + '"'
    ];

    imgInfoList.forEach(function(imgInfo, idx) {
        cmd = cmd.concat(drawImage(imgInfo.imgFile, imgInfo.x + Config.borderWidth, imgInfo.y + Config.borderWidth));

        // cmd = cmd.concat(strokeRect(imgInfo.x, imgInfo.y, imgInfo.w, imgInfo.h, 2, "red"));
        // cmd = cmd.concat(fillText(imgInfo.index, imgInfo.x + 4, imgInfo.y + 16, 16, 'SourceSansProL'));
    });

    // var ext = null;
    // if (Config.trimBy === Config.packBgColor) {
    //     ext = [
    //         '-bordercolor',
    //         '"' + Config.packBgColor + '"',
    //         '-compose copy',
    //         borderArgument
    //     ];
    // }

    // cmd = cmd.concat([
    //     '-bordercolor',
    //     '"' + Config.packBgColor + '"',
    //     '-compose copy',
    //     Config.trimBy ? '-trim' : '',
    //     ext ? ext.join(' ') : borderArgument,
    //     '"' + outputFile + '"'
    // ]);

    cmd = cmd.concat([
        '"' + outputFile + '"'
    ]);

    callCmd(cmd.join(' '), function(err) {
        readImageSize(outputFile, function(w, h) {
            var stats = fs.statSync(outputFile);
            var fileSizeInBytes = stats["size"];
            var kb = (fileSizeInBytes / 1000).toFixed(2)
            console.log("\n");
            console.log("==== packed: " + outputFile + " ( " + ruleName + " ) ---- " + w + " * " + h + " , " + kb + "kb" + " ====");
            console.log('    { id: "' + outputFile + '", src: "' + outputFile + '.png" }');
            console.log("\n");
            if (Config.optipng) {
                console.log("  start optipng " + outputFile + " ...");
                var cmd = 'optipng -o4 "' + outputFile + '"';
                callCmd(cmd, function(stdout) {
                    cb && cb();
                });
            } else {
                cb && cb();
            }
        });
    });
}


function computeImageSize(imageInfo, fileName) {
    imageInfo.w += Config.borderWidth * 2;
    imageInfo.h += Config.borderWidth * 2;

    // imageInfo.ox -= Config.borderWidth;
    // imageInfo.oy -= Config.borderWidth;
    // imageInfo.sw -= Config.borderWidth * 2;
    // imageInfo.sh -= Config.borderWidth * 2;

    var f = parsePercent(Config.anchorX);
    var anchorX = f === false ? parseFloat(Config.anchorX) || 0 : imageInfo.sw * f;
    var f = parsePercent(Config.anchorY);
    var anchorY = f === false ? parseFloat(Config.anchorY) || 0 : imageInfo.sh * f;
    imageInfo.anchor = [anchorX - imageInfo.ox, anchorY - imageInfo.oy];
}



function drawImage(img, x, y) {
    return [
        '-draw',
        '"image Over',
        x + ',' + y,
        0 + ',' + 0,
        '\\"' + img + '\\""'
    ];
}

function strokeRect(x, y, w, h, lineWidth, color) {
    return [
        '-strokewidth',
        lineWidth || 1,
        '-stroke',
        color || 'black',
        '-fill',
        'none',
        '-draw',
        '"rectangle',
        x + ',' + y, (x + w) + ',' + (y + h),
        '"'
    ];
}

function fillText(text, x, y, size, font) {
    return [
        '-pointsize',
        size || 12,
        '-font',
        '"' + font + '"',
        '-draw',
        '"text', x + ',' + y,
        '\\"' + text + '\\"',
        '"'
    ];

}





////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////


function computeTrimInfo(img, cb) {
    var cmd = 'magick convert "' + img + '" -bordercolor "' + Config.trimBy + '" -compose copy ' + borderArgument + ' -trim info:-';
    callCmd(cmd, function(stdout) {
        if (stdout) {
            var rs = stdout.trim().split(" ");
            var size = rs[2].split("x");
            var offset = rs[3].split("+").slice(1, 3);
            var sourceSize = rs[3].split("+")[0].split("x");
            var imageInfo = {
                x: 0,
                y: 0,
                w: Number(size[0]),
                h: Number(size[1]),

                ox: Number(offset[0]) - Config.borderWidth,
                oy: Number(offset[1]) - Config.borderWidth,
                sw: Number(sourceSize[0]) - Config.borderWidth * 2,
                sh: Number(sourceSize[1]) - Config.borderWidth * 2,

                imgFile: getTrimedImageName(img),
            };
            // console.log(stdout,imageInfo.imgFile, offset, sourceSize)
            // console.log(imageInfo)
            if (cb) {
                cb(imageInfo)
            }
        }
    });
}

function trimImages(imageFiles, cb) {

    var trimedFiles = {};

    var len = imageFiles.length;
    var idx = -1;
    var $next = function() {
        idx++;
        if (idx >= len) {

            cb && cb(trimedFiles);

            return;
        }
        var img = imageFiles[idx];

        var trimedFile = getTrimedImageName(img);
        var dir = Path.dirname(trimedFile);
        if (!fs.existsSync(dir)) {
            fsExt.ensureDirSync(dir);
        }

        trimImg(img, trimedFile, function() {
            trimedFiles[img] = trimedFile;
            $next();
        });

    };

    $next();
}

// 'magick convert output/scale/PlatformA-1.png -trim output/trim/PlatformA-1.png'

function trimImg(img, outImg, cb) {
    var cmd = 'magick convert "' + img + '" -bordercolor "' + Config.trimBy + '" -compose copy ' + borderArgument + ' -trim -bordercolor "' + Config.trimBy + '" -compose copy ' + borderArgument + ' "' + outImg + '"';
    // var cmd = 'magick convert "' + img + '" -trim "' + outImg + '"';
    callCmd(cmd, function() {
        console.log("==== trimed : " + outImg + " ====");
        cb && cb();
    });
}


function getTrimedImageName(imgFile) {
    var trimedFile = Path.relative(inputDir, imgFile);
    trimedFile = Path.normalize(trimOutputDir + "/" + trimedFile);
    return trimedFile;
}




////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////


function scaleImages(imageFiles, scale, cb) {
    scale = scale || 1;
    if (String(scale).indexOf("%") < 1) {
        scale = scale * 100 + "%";
    }
    var idx = 0;
    var $next = function() {
        if (idx >= imageFiles.length) {
            cb && cb(scale);
            return;
        }
        var img = imageFiles[idx];
        var fileName = Path.basename(img);

        var outScaleImg = Path.relative(inputDir, img);
        outScaleImg = Path.normalize(scaleOutputDir + "/" + outScaleImg);
        var dir = Path.dirname(outScaleImg);
        if (!fs.existsSync(dir)) {
            fsExt.ensureDirSync(dir);
        }

        if (Path.extname(fileName) === Config.cfgFileExtName) {
            copyFileSync(img, outScaleImg);
            $next();
        } else {
            resizeImage(img, scale, scale, outScaleImg, function() {
                $next();
            });
        }
        idx++;
    }
    $next();
}

function resizeImage(img, scaleX, scaleY, outImg, cb) {
    // return scaleImage(img,scaleX,outImg,cb);
    var flipX = Config.flipX;
    var flipY = Config.flipY;
    var flip = (flipX ? '-flop ' : '') + (flipY ? '-flip ' : '');
    var cmd;
    // cmd='magick convert "' + img + '" -resize ' + scaleX + 'x' + scaleY + '! "' + outImg + '"';
    cmd = 'magick convert ' + flip + ' -filter lanczos -resize ' + scaleX + 'x' + scaleY + '! "' + img + '" "' + outImg + '"';
    // cmd='magick convert "' + img + '" -adaptive-resize ' + scaleX + 'x' + scaleY + '! "' + outImg + '"';
    // cmd = 'magick convert -define filter:blur=0.5 -filter lanczos -resize ' + scaleX + 'x' + scaleY + '! "' + img + '" "' + outImg + '"';
    callCmd(cmd, function() {
        console.log("==== scaled : " + outImg + " ====");
        cb && cb();
    });
}


function addShadows(imageFiles, shadow, cb) {

    var idx = 0;
    var $next = function() {
        if (idx >= imageFiles.length) {
            cb && cb();
            return;
        }
        var img = imageFiles[idx];
        var fileName = Path.basename(img);

        var outShadowImg = Path.relative(inputDir, img);
        outShadowImg = Path.normalize(shadowOutputDir + "/" + outShadowImg);
        var dir = Path.dirname(outShadowImg);
        if (!fs.existsSync(dir)) {
            fsExt.ensureDirSync(dir);
        }

        if (Path.extname(fileName) === Config.cfgFileExtName) {
            copyFileSync(img, outShadowImg);
            $next();
        } else {
            addShadow(img, outShadowImg, shadow, function() {
                console.log("==== shadow added: " + (outShadowImg) + " ====");
                $next();
            });
        }
        idx++;
    }
    $next();

}



function addShadow(inFile, outFile, shadowInfo, cb) {


    // TODO : read the size of shadow-image file.

    inFile = Path.normalize(inFile);
    outFile = Path.normalize(outFile);

    var cx = shadowInfo.width / 2;
    var cy = shadowInfo.height / 2;
    var shadowX = Config.anchorX - cx;
    var shadowY = Config.anchorY - cy;

    var width = inFile.width;
    var height = Math.max(inFile.height, Config.anchorY + shadowInfo.height);

    var cmd = ['magick convert',
        '-size',
        width + 'x' + height,
        'xc:"' + Config.packBgColor + '"'
    ];

    cmd = cmd.concat(drawImage(shadowInfo.imgFile, shadowX, shadowY));
    cmd = cmd.concat(drawImage(inFile, 0, 0));

    cmd = cmd.concat([
        '-bordercolor',
        '"' + Config.packBgColor + '"',
        '-compose copy',
        '"' + outputFile + '"'
    ]);

    callCmd(cmd.join(' '), function(err) {
        if (err) {
            console.log("addShadow err : ", inFile, outFile, err);
            return;
        }
        cb && cb()
    });
    // withShadow = withShadow.draw("image", "Over", x + "," + y, shadowWidth + "," + shadowHeight, shadowImg);
    // withShadow = withShadow.draw("image", "Over", 0 + "," + 0, 0 + "," + 0, inFile)

}


////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////


function parsePercent(percent) {
    if (String(percent).indexOf("%") > 0) {
        var p = parseInt(percent, 10);
        return p / 100;
    }
    return false;
}

function parseNumberAttr(attr) {
    if (attr === "all") {
        return "all"
    } else if (attr === "none" || attr === null || attr === undefined) {
        return "none"
    }
    return parseInt(attr, 10);
}



function readImageSize(imgPath, cb) {
    var cmd;
    cmd = 'magick identify -ping -format %wx%h "' + imgPath + '"';
    callCmd(cmd, function(stdout) {
        var split = stdout.trim().split(" ").shift().split("x");
        var width = parseInt(split[0], 10),
            height = parseInt(split[1], 10);

        cb && cb(width, height);
    });
}


function copyFileSync(srcFile, destFile) {
    if (!fs.existsSync(srcFile)) {
        return;
    }
    if (fs.existsSync(destFile)) {
        fs.unlinkSync(destFile);
    }
    var contents = fs.readFileSync(srcFile);
    fs.writeFileSync(destFile, contents);
    var stat = fs.lstatSync(srcFile);
    fs.chmodSync(destFile, stat.mode);
}


function cleanArray(list) {
    var last = list.length - 1;
    for (var i = last; i >= 0; i--) {
        if (!list[i]) {
            list[i] = list[last];
            last--;
        }
    }
    list.length = last + 1;
    return list;
}


function overide(receiver, supplier) {
    for (var key in supplier) {
        receiver[key] = supplier[key];
    }
    return receiver;
}

function cleanDir(dir) {
    if (fs.existsSync(dir)) {
        fsExt.removeSync(dir);
    }
    fsExt.ensureDirSync(dir);
}

function callCmd(cmd, cb) {
    // console.log(cmd)
    cp.exec(cmd, function(err, stdout, stderr) {
        // console.log(cmd);
        err = err || stderr;
        if (err) {
            console.log(cmd)
            console.log(err);
            return;
        }
        cb && cb(stdout);
    });
}

function getFiles(dir) {
    var files = glob.sync(Path.normalize(dir + "/**/*.png"), {});
    files = files.concat(glob.sync(Path.normalize(dir + "/**/*.jpg"), {}));
    files = files.concat(glob.sync(Path.normalize(dir + "/**/*" + Config.cfgFileExtName), {}));
    files.sort();
    return files
}

///////////////////////////////////
///////////////////////////////////
///////////////////////////////////
///////////////////////////////////
///////////////////////////////////
///////////////////////////////////
///////////////////////////////////
///////////////////////////////////
///////////////////////////////////

exports.Config = Config;
exports.main = main;
exports.packImages = packImages;
exports.preparePackImages = preparePackImages;


// magick convert *.png -resize 50% -set filename:orig "%f" 'converted/%[filename:orig].png'
// magick convert *.tga -set filename:orig "%t" '%[filename:orig].png'
// magick convert *.webp -set filename:orig "%t" '%[filename:orig].png'
// magick convert unnamed.webp unnamed.png
