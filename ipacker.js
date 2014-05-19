"use strict";

var fs = require('fs');
var cp = require('child_process');
var Path = require('path');
var wrench = require('wrench');
var glob = require('glob');
var program = require('commander');
var gm = require('gm');

var imageMagick = gm.subClass({
    imageMagick: true
});
var GrowingPacker = require('./lib/packer.growing').GrowingPacker;
var Packer = require('./lib/packer').Packer;

program
    .version('0.5')
    .option('-i --input [string]', 'input dir name')
    .option('-o --output [string]', 'output dir name')
    .option('-p --pack [int number/"all"]', 'pack by a part of nameParts: 0,1,2,3,4... .\n\t "all"/empty means all-in-one')
    .option("-n --name [string]", "packed file's name")
    .option('--width [int number]', "pack file's min width")
    .option('--height [int number]', "pack file's min height")
    .option('--ox [number/percent]', "the orignal X in source images. number means n pixel.\n\t percent(e.g. 35%) means the position of width")
    .option('--oy [number/percent]', "the orignal Y in source images. number means n pixel.\n\t percent(e.g. 35%) means the position of height")
    .option('-s --scale [number]', 'scale all images')
    .option('-m --margin [int number]', "the margin of one image")
    .option('--split [string]', 'file-part split char')
    .option('--packonly', "only pack (and scale),  not trim")
    .option('--configonly ', "create config file only")
    .parse(process.argv);

if (process.argv.length < 3) {
    program.help();
    process.exit();
}

var cwd = process.env.PWD || process.cwd();

function getFiles(dir) {
    var files = glob.sync(Path.normalize(dir + "/**/*" + Config.imgFileExtName), {});
    files = files.concat(glob.sync(Path.normalize(dir + "/**/*" + Config.cfgFileExtName), {}));
    files.sort();
    return files
}

var inputDir = program.input || "./input/";
var outputDir = program.output || "./output/";

inputDir = Path.normalize(inputDir + "/");
outputDir = Path.normalize(outputDir + "/");

var trimOutputDir = Path.normalize(outputDir + "/trim/");
var scaleOutputDir = Path.normalize(outputDir + "/scale/");
var packOutputDir = Path.normalize(outputDir + "/pack/");
var imgMappingDir = Path.normalize(packOutputDir + "/img-mapping/");

var Config;

(function() {
    var packBy = program.pack;
    var packageWidth = parseInt(program.width, 10) || 64; // 64 128 256 512 1024 2048
    var packageHeight = parseInt(program.height, 10) || 64;
    var scale = program.scale || "100%";
    var name = program.name || "all_pack";
    var packOnly = program.packonly || false;
    var configOnly = program.configonly || false;
    var borderSpace = parseInt(program.margin || 2, 10);

    packBy = packBy === true ? "all" : packBy;
    if (packBy != "all") {
        packBy = parseInt(packBy || 0, 10) || 0;
    }
    Config = {
        packBy: packBy,
        packageWidth: packageWidth,
        packageHeight: packageHeight,
        scale: scale,
        packName: name,
        borderSpace: borderSpace,
        doTrim: !configOnly,
        doPack: !configOnly,
        packOnly: packOnly,
        split: program.split || "-",

        optipng: false,
        sourceOrignalX: program.ox || 0, //"50%",
        sourceOrignalY: program.oy || 0, //"50%",
        trimBgColor: "transparent",
        packBgColor: "transparent",
        imgFileExtName: ".png",
        cfgFileExtName: ".txt",
        resDir: "res/image/",
        dirPart: 2,
    }

}());


var allImagesInfo;
var trimImagesInfo;

var orignalInputDir = inputDir;
var inputFiles = getFiles(inputDir);

if (Config.scale != 1) {
    cleanDir(scaleOutputDir);
    startScale(function() {
        var scaledFiles = getFiles(scaleOutputDir);
        inputDir = scaleOutputDir;

        if (Config.doTrim) {
            cleanDir(trimOutputDir);
        }
        if (Config.doPack) {
            cleanDir(packOutputDir);
        }
        cleanDir(imgMappingDir);
        start(scaledFiles);
    });
} else {
    if (Config.doTrim) {
        cleanDir(trimOutputDir);
    }
    if (Config.doPack) {
        cleanDir(packOutputDir);
    }
    cleanDir(imgMappingDir);
    start(inputFiles);
}



function start(files) {

    files = files || inputFiles;

    startParse(files, function(filesInfo) {
        if (Config.packOnly) {
            startPack(filesInfo.list, function(fileInfoList, packGroupInfo) {
                createMapping(fileInfoList);
            });
        } else {
            startTrim(filesInfo.list, function(fileInfoList, trimFilesInfo) {
                startPack(fileInfoList, function(fileInfoList, packGroupInfo) {
                    createMapping(fileInfoList);
                });
            });
        }
    });
}



function createMapping(infoList) {
    if (infoList.length < 1) {
        console.log("==== Nothing to do ====");
        return;
    }
    console.log("\n\n");

    var code1 = "var ImageMapping=ImageMapping||{};\n(function(){";
    // var code2 = "Image.merge(ImageMapping,_imgs);\n\n}());";
    var code2 = "for (var key in _imgs){ ImageMapping[key]=_imgs[key]; }\n\n})();";

    var mapping = {};
    infoList.forEach(function(info) {
        if (info.imageInfo) {
            var f = {
                img: info.packBy,
                x: info.imageInfo.x,
                y: info.imageInfo.y,
                w: info.imageInfo.w,
                h: info.imageInfo.h,
                ox: info.imageInfo.ox,
                oy: info.imageInfo.oy,
            }
            mapping[info.baseName] = f;
        }
    });
    var outputStr = "var _imgs=" + JSON.stringify(mapping, function(k, v) {
        return v
    }, 2) + ";";
    var code = code1 + "\n\n" + outputStr + "\n\n" + code2;

    var js = Path.normalize(imgMappingDir + Config.packName + ".js");
    fs.writeFileSync(js, code);
}



function createImagesTree(fileInfoList) {

    var tree = {};
    var root = tree;
    if (Config.packBy == "all") {
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
                oy: info.imageInfo.oy,
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

    var code1 = "var ImagePool=ImagePool||{};\n(function(){";
    // var code2 = "Image.merge(ImagePool,_imgs);\n\n}());";
    var code2 = "for (var key in _imgs){ ImagePool[key]=_imgs[key]; }\n\n})();";

    var config;
    for (var key in tree) {
        if (Config.packBy == "all") {
            config = tree[key];
        } else {
            config = {};
            config[key] = tree[key];
        }
        var outputStr = "var _imgs=" + JSON.stringify(config, function(k, v) {
            return v
        }, 2) + ";";
        var code = code1 + "\n\n" + outputStr + "\n\n" + code2;

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
            imageInfo.sx = 0;
            imageInfo.sy = 0;
            imageInfo.sw = w;
            imageInfo.sh = h;
            imageInfo.w = w;
            imageInfo.h = h

            computeImageSize(imageInfo);

            $next();
        });
    }
    $next();

    return filesInfo;
}



function parseOrignalFileName(orignalFile, packBy) {

    var dirName = Path.dirname(orignalFile);
    dirName = Path.relative(inputDir, dirName) || "";
    var dirs = dirName.split(Path.seq);
    var firstDir = dirs[0] || "";
    var lastDir = dirs[dirs.length - 1] || "";
    var extName = Path.extname(orignalFile);
    var baseName = Path.basename(orignalFile, extName);
    var fileParts = baseName.split(Config.split);
    var filePartCount = fileParts.length;

    var info = {
        parts: [],
        baseName: baseName,
        firstDir: firstDir,
        lastDir: lastDir,
    };
    var imgFile = orignalFile;
    if (extName == Config.cfgFileExtName) {
        var realImg = fs.readFileSync(orignalFile).toString().trim();
        imgFile = Path.normalize(Path.dirname(orignalFile) + "/" + realImg);
    }
    info.imgFile = imgFile;

    packBy = packBy || packBy === 0 ? packBy : Config.packBy;

    if (packBy === "all") {
        info.packBy = Config.packName;
        info.parts = [baseName];
    } else if (packBy === 0) {
        info.packBy = (info.firstDir || Config.packName) //+ Config.imgFileExtName;
        // info.parts = [baseName];
        info.parts = [info.packBy, baseName];
    } else {
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

    var packGroupInfo = {};

    var packTrimInfo = {};
    fileInfoList.forEach(function(_info, idx) {
        var list = packGroupInfo[_info.packBy] = packGroupInfo[_info.packBy] || [];
        list.push(_info);

        list = packTrimInfo[_info.packBy] = packTrimInfo[_info.packBy] || [];
        _info.imageInfo._index = idx;
        list.push(_info.imageInfo)
    });

    var packsInfo = [];
    for (var packBy in packTrimInfo) {

        var imgInfoList = packTrimInfo[packBy];
        var packedFile = Path.normalize(packOutputDir + "/" + packBy + Config.imgFileExtName);
        var size = preparePackImages(imgInfoList);
        packsInfo.push({
            packBy: packBy,
            imgInfoList: imgInfoList,
            packedFile: packedFile,
            size: size,
        });
    }

    if (Config.doPack) {
        var count = packsInfo.length;
        var idx = -1;
        var $next = function() {
            idx++;
            if (idx >= count) {
                cb && cb(fileInfoList, packGroupInfo);
                return;
            }
            var packInfo = packsInfo[idx];
            packImages(packInfo, function() {
                $next();
            });
        }
        $next();
    } else {
        cb && cb(fileInfoList, packGroupInfo);
    }
}



function startTrim(fileInfoList, cb) {

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
                computeImageSize(imageInfo);
                info.imageInfo = imageInfo;
                $next();
            });
        }
    }
    $next();

}



function startScale(cb) {

    scaleImages(inputFiles, Config.scale, function(scale) {
        console.log("\n\n");
        console.log("==== all images scaled : " + scale + " ====");

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

function preparePackImages(imgInfoList, width, height, space) {
    space = space || 0;
    var maxWidth = width || 2048;
    var maxHeight = height || 2048;
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

    imgInfoList.sort(function(a, b) {
        // return Math.max(b.w,b.h) - Math.max(a.w,a.h);
        var d = b.h - a.h;
        d = d ? d : b.w - a.w;
        return d ? d : b.index - a.index;
        // return b.w - a.w;
    });

    var packInfo;
    var packInfoH = computePackInfo(imgInfoList, maxWidth, maxHeight);
    if (packInfoH[1]) {
        imgInfoList.sort(function(a, b) {
            var d = b.w - a.w;
            d = d ? d : b.h - a.h;
            return d ? d : b.index - a.index;
            // return Math.max(b.w,b.h) - Math.max(a.w,a.h);
            // return b.h - a.h;
        });
        packInfoW = computePackInfo(imgInfoList, maxWidth, maxHeight);
        if (packInfoW[1] && packInfoH[1].length < packInfoW[1].length) {
            packInfo = packInfoH;
        } else {
            packInfo = packInfoW;
        }
    } else {
        packInfo = packInfoH;
    }
    var packed = packInfo[0];

    var unpacked = packInfo[1];
    if (unpacked) {
        console.log("Images are too many or too big");
        // preparePackImages(unpacked, width, height, packedIndex + 1);
    }
    return [packInfo[2], packInfo[3]];
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
            f.x = f.fit.x;
            f.y = f.fit.y;
            packed.push(f);
        } else {
            unpacked.push(f);
        }
    }
    return [packed, unpacked.length > 0 ? unpacked : null, packer.root.w, packer.root.h];
}

function _computePackInfo(imgInfoList, cb) {

    var compute = function(width, height, imgInfoList) {

        var out = false;

        for (var n = 0; n < imgInfoList.length; n++) {
            var f = imgInfoList[n];
            delete f.fit;
        }

        var packer = new Packer(width, height);
        packer.fit(imgInfoList);
        for (var n = 0; n < imgInfoList.length; n++) {
            var f = imgInfoList[n];
            if (f.fit) {
                // 'image Over 100,100 225,225 image.jpg'
                var x = f.fit.x + Config.borderSpace,
                    y = f.fit.y + Config.borderSpace;
                // var w = f.fit.w - Config.borderSpace * 2,
                //     h = f.fit.h - Config.borderSpace * 2;
                f.x = f.fit.x;
                f.y = f.fit.y;
                delete f.fit;
            } else {
                out = true;
                break;
            }
        }
        return out;
    };

    var width = Config.packageWidth;
    var height = Config.packageHeight;

    do {
        var expanded = false,
            out = false;
        imgInfoList.sort(function(a, b) {
            return b.h - a.h;
        });
        out = compute(width, height, imgInfoList);
        if (out) {
            imgInfoList.sort(function(a, b) {
                return b.w - a.w;
            });
            out = compute(width, height, imgInfoList);
        }

        if (out) {
            if (width <= height) {
                width = width * 2;
            } else {
                height = height * 2;
            }
            expanded = true;
        }
    } while (expanded);
    return [width, height];
}


function computeImageSize(imageInfo) {
    imageInfo.sx -= Config.borderSpace;
    imageInfo.sy -= Config.borderSpace;
    imageInfo.w += Config.borderSpace * 2;
    imageInfo.h += Config.borderSpace * 2;
    var f = parsePercent(Config.sourceOrignalX);
    var ox = f === false ? parseFloat(Config.sourceOrignalX) || 0 : imageInfo.sw * f;
    var f = parsePercent(Config.sourceOrignalY);
    var oy = f === false ? parseFloat(Config.sourceOrignalY) || 0 : imageInfo.sh * f;
    imageInfo.ox = ox - imageInfo.sx;
    imageInfo.oy = oy - imageInfo.sy;
}


function packImages(packInfo, cb) {
    var imgInfoList = packInfo.imgInfoList;
    var packedFile = packInfo.packedFile;
    var size = packInfo.size;
    var width = size[0],
        height = size[1];
    var packedImg = imageMagick(width, height, Config.packBgColor);
    imgInfoList.forEach(function(imgInfo) {
        packedImg = packedImg.draw("image", "Over", imgInfo.x + "," + imgInfo.y, 0 + "," + 0, "\""+imgInfo.imgFile+"\"");
    });

    packedImg = packedImg.trim().borderColor(Config.packBgColor).border(Config.borderSpace, Config.borderSpace);
    packedImg.write(packedFile, function(err) {
        if (err) {
            console.log("packRect err : ", packedFile, err);
            return;
        }
        console.log("==== packed: " + packedFile + " ====");
        if (Config.optipng) {
            console.log("start optipng " + packedFile + " ...");
            cp.exec("optipng -o4 " + packedFile, function(err, stdout, stderr) {
                if (err) {
                    console.log("optipng err : ", err);
                    return;
                }
                cb && cb();
            });
        } else {
            cb && cb();
        }
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



function computeTrimInfo(img, cb) {
    cp.exec("convert " + img + " -trim info:-", function(err, stdout, stderr) {
        if (stdout) {
            var rs = stdout.trim().split(" ");
            var size = rs[2].split("x");
            var offset = rs[3].split("+").slice(1, 3);
            var sourceSize = rs[3].split("+")[0].split("x");
            var imageInfo = {
                sx: Number(offset[0]),
                sy: Number(offset[1]),
                sw: Number(sourceSize[0]),
                sh: Number(sourceSize[1]),
                w: Number(size[0]),
                h: Number(size[1]),
                imgFile: getTrimedImageName(img),
            };
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
            wrench.mkdirSyncRecursive(dir);
        }

        // imageMagick(img).trim().borderColor(Config.trimBgColor).border(Config.borderSpace, Config.borderSpace).write(trimedFile, function(err) {
        imageMagick(img).trim().write(trimedFile, function(err) {
            if (err) {
                console.log("trimImage err : ", err);
                return;
            }
            trimedFiles[img] = trimedFile;

            console.log("==== trimed: " + trimedFile + " ====");

            $next();
        });

    }
    $next();
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
            wrench.mkdirSyncRecursive(dir);
        }

        if (Path.extname(fileName) == Config.cfgFileExtName) {
            copyFileSync(img, outScaleImg);
            $next();
        } else {
            resizeImage(img, scale, scale, outScaleImg, function(){
                $next();
            });
            // scaleImage(img, outScaleImg, scale, function() {
            //     $next();
            // });
        }
        idx++;
    }
    $next();
}

function resizeImage(img, scaleX, scaleY, outImg, cb) {
    var cmd;
    // cmd='convert ' + img + ' -resize ' + scaleX + 'x' + scaleY + '! ' + outImg;
    cmd = 'convert -define filter:blur=0.5 -filter lanczos -resize ' + scaleX + 'x' + scaleY + '! ' + img + ' ' + outImg;
    callCmd(cmd, cb);
}

function scaleImage(img, outImg, scale, cb) {

    imageMagick(img).scale(scale).write(outImg, function(err) {
        if (err) {
            console.log("scaleImage err : ", err);
            return;
        }
        console.log("==== image scaled : " + (outImg) + " ====");

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


function parsePercent(percent) {
    if (String(percent).indexOf("%")>0) {
        var p = parseInt(percent, 10);
        return p / 100;
    }
    return false;
}

function parseNumberAttr(attr) {
    if (attr == "all") {
        return "all"
    } else if (attr == "none" || attr === null || attr === undefined) {
        return "none"
    }
    return parseInt(attr, 10);
}



function readImageSize(imgPath, cb) {

    imageMagick(imgPath).size(function(err, size) {
        if (err) {
            console.log(imgPath, err);
            return;
        }
        if (cb) {
            cb(size.width, size.height);
        }
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
        wrench.rmdirSyncRecursive(dir);
    }
    wrench.mkdirSyncRecursive(dir);
}

function callCmd(cmd, cb) {
    cp.exec(cmd, function(err, stdout, stderr) {
        // console.log(cmd);
        if (stderr) {
            console.log(stderr)
        }
        cb && cb(stdout);
    });
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
