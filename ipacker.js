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
    .option("-n --name [string]", "packed file's name")
    .option('-w --width [int number]', "pack file's min width")
    .option('-h --height [int number]', "pack file's min height")
    .option('--split [string]', 'file-part split char')
    .option('-s --scale [number]', 'scale all images')
    .option('-p --pack [int number]', 'pack by a part of nameParts: all,0,1,2,3,4... "all" is all-in-one')
    .option('-m --margin [int number]', "the margin of one image")
    .option('-op --onlypack', "only pack (and scale),  not trim")
    .option('-oc --onlyconfig ', "create config file only")
    .parse(process.argv);


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
var imgConfigDir = Path.normalize(packOutputDir + "/img-config/");

var Config;

(function() {

    var packBy = program.pack || 0;
    var packageWidth = parseInt(program.width, 10) || 64; // 64 128 256 512 1024 2048
    var packageHeight = parseInt(program.height, 10) || 64;
    var scale = Number(program.scale) || 1;
    var name = program.name || "all_pack";
    var configOnly = program.onlyconfig || false;
    var packOnly = program.onlypack || false;
    var imgSpace = parseInt(program.margin, 10) || 4;

    if (packBy != "all") {
        packBy = parseInt(packBy || 0, 10) || 0;
    }

    Config = {
        packBy: packBy,
        packageWidth: packageWidth,
        packageHeight: packageHeight,
        scale: scale,
        packName: name,
        imgSpace: imgSpace,
        doTrim: !configOnly,
        doPack: !configOnly,
        packOnly: packOnly,
        split: program.split || "-",

        optipng: false,
        sourceOrignalX: 0.5,
        sourceOrignalY: 0.5,
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
        cleanDir(imgConfigDir);
        start(scaledFiles);
    });
} else {
    if (Config.doTrim) {
        cleanDir(trimOutputDir);
    }
    if (Config.doPack) {
        cleanDir(packOutputDir);
    }
    cleanDir(imgConfigDir);
    start(inputFiles);
}



function start(files) {

    files = files || inputFiles;

    var filesInfo = startParse(files);

    if (Config.packOnly) {

        startPack(fileInfo.list, function(fileInfoList, packGroupInfo) {

        });

    } else {

        startTrim(filesInfo.list, function(fileInfoList, trimFilesInfo) {

            startPack(fileInfoList, function(fileInfoList, packGroupInfo) {

                var tree = createImagesTree(fileInfoList);
                console.log(JSON.stringify(tree, null, 2));

                createJS(tree);
            });

        });

    }
}


function createImagesTree(fileInfoList) {

    var tree = {};
    var root = tree;
    if (Config.packBy == "all" || Config.packBy == 0) {
        root = tree[Config.packName] = {};
    }

    fileInfoList.forEach(function(info) {
        var parts = info.parts;
        var obj = root;
        for (var i = 0; i < parts.length; i++) {
            key = parts[i];
            obj = obj[key] = obj[key] || {};
        }
        obj.img = info.packBy;
        if (info.trimedInfo) {
            var f = {
                x: info.trimedInfo.x,
                y: info.trimedInfo.y,
                w: info.trimedInfo.w,
                h: info.trimedInfo.h,
                ox: info.trimedInfo.ox,
                oy: info.trimedInfo.oy,
            }
            obj.frame = f;
        }
    });
    return tree;

}

function createJS(configGroup) {
    var keys = Object.keys(configGroup);
    if (keys.length < 1) {
        console.log("==== Nothing to do ====");
        return;
    }

    console.log("\n\n");

    var code1 = "var ImagePool=ImagePool||{};\n(function(){";
    // var code2 = "Image.merge(ImagePool,_imgs);\n\n}());";
    var code2 = "for (var key in _imgs){ ImagePool[key]=_imgs[key]; }\n\n})();";

    for (var key in configGroup) {
        // var config = {};
        // config[key] = configGroup[key];
        var config = configGroup[key];
        var outputStr = "var _imgs=" + JSON.stringify(config, function(k, v) {
            return v
        }, 2) + ";";
        var code = code1 + "\n\n" + outputStr + "\n\n" + code2;

        var js = Path.normalize(imgConfigDir + key + ".js");
        fs.writeFileSync(js, code);

        console.log("{id: \"" + key + "\", src: \"" + Config.resDir + key + Config.imgFileExtName + "\" },");
    }
    console.log("\n\n");


    for (var key in configGroup) {
        console.log('<script src="../output/pack/img-config/' + key + '.js"></script>');
    }
    console.log("<script>var ResList=[");
    for (var key in configGroup) {
        console.log("{id: \"" + key + "\", src: \"../output/pack/" + key + Config.imgFileExtName + "\" },");
    }
    console.log("];</script>");


    console.log("\n\n");
    console.log("==== Done ====");

}


function startParse(fileList) {

    var filesInfo = {
        list: [],
        map: {}
    };

    fileList.forEach(function(file) {
        var info = {
            orignalFile: file,
            file: null
        };
        filesInfo.list.push(info);
        filesInfo.map[info.orignalFile] = info;

        var parsedInfo = parseOrignalFileName(info.orignalFile, Config.packBy);
        overide(info, parsedInfo);

    });


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

    packBy = packBy && packBy !== 0 ? packBy : Config.packBy;

    if (packBy === "all") {
        info.packBy = Config.packName;
        info.parts = [baseName];
    } else if (packBy === 0) {
        info.packBy = (info.firstDir || Config.packName) //+ Config.imgFileExtName;
        info.parts = [baseName];
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
    fileInfoList.forEach(function(_info) {
        var list = packGroupInfo[_info.packBy] = packGroupInfo[_info.packBy] || [];
        list.push(_info);

        list = packTrimInfo[_info.packBy] = packTrimInfo[_info.packBy] || [];
        list.push(_info.trimedInfo)
    });

    var packsInfo = [];
    for (var packBy in packTrimInfo) {
        var imgInfoList = packTrimInfo[packBy];
        var packedFile = Path.normalize(packOutputDir + "/" + packBy + Config.imgFileExtName);
        var size = computePackInfo(imgInfoList);
        packsInfo.push({
            packBy: packBy,
            imgInfoList: imgInfoList,
            packedFile: packedFile,
            size: size,
        })
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
    idx = -1;
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

            computeTrimInfo(info.imgFile, function(trimedInfo) {
                trimedInfo.w += Config.imgSpace;
                trimedInfo.h += Config.imgSpace;
                trimedInfo.ox = trimedInfo.sw * Config.sourceOrignalX - trimedInfo.sx + Config.imgSpace / 2,
                trimedInfo.oy = trimedInfo.sh * Config.sourceOrignalY - trimedInfo.sy + Config.imgSpace / 2,

                info.trimedInfo = trimedInfo;

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


function computePackInfo(imgInfoList, cb) {

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
                var x = f.fit.x + Config.imgSpace / 2,
                    y = f.fit.y + Config.imgSpace / 2;
                // var w = f.fit.w - Config.imgSpace,
                //     h = f.fit.h - Config.imgSpace;
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



function packImages(packInfo, cb) {
    var imgInfoList = packInfo.imgInfoList;
    var packedFile = packInfo.packedFile;
    var size = packInfo.size;
    var width = size[0],
        height = size[1];

    var packedImg = imageMagick(width, height, Config.packBgColor);
    imgInfoList.forEach(function(imgInfo) {
        packedImg = packedImg.draw("image", "Over", imgInfo.x + "," + imgInfo.y, 0 + "," + 0, imgInfo.trimedFile);
    });

    packedImg = packedImg.trim().borderColor(Config.packBgColor).border(Config.imgSpace / 2, Config.imgSpace / 2);
    packedImg.write(packedFile, function(err) {
        if (err) {
            console.log("packRect err : ", packedFile, err);
            return;
        }
        console.log("==== packed: " + packedFile + " ====");
        if (Config.optipng){
            console.log("start optipng "+packedFile+" ...");
            cp.exec("optipng -o4 " + packedFile, function(err, stdout, stderr) {
                if (err) {
                    console.log("optipng err : ", err);
                    return;
                }
                cb && cb();
            });
        }else{
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

            var trimedInfo = {
                sx: Number(offset[0]),
                sy: Number(offset[1]),
                sw: Number(sourceSize[0]),
                sh: Number(sourceSize[1]),
                w: Number(size[0]),
                h: Number(size[1]),
                trimedFile: getTrimedImageName(img),
            };
            if (cb) {
                cb(trimedInfo)
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

        // imageMagick(img).trim().borderColor(Config.trimBgColor).write(trimedFile, function(err) {
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
            scaleImage(img, outScaleImg, scale, function() {
                $next();
            });
        }
        idx++;
    }
    $next();
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




function parseNumberAttr(attr) {
    if (attr == "all") {
        return "all"
    } else if (attr == "none" || attr === null || attr === undefined) {
        return "none"
    }
    return parseInt(attr, 10);
}



function readImageSize(imgPath, frame, cb) {

    imageMagick(imgPath).size(function(err, value) {
        if (err) {
            console.log(imgPath, err);
            return;
        } else {
            frame.w = value.width;
            frame.h = value.height;
        }
        if (cb) {
            cb();
        }
    });
}


function copyFileSync(srcFile, destFile) {
    if (!fs.existsSync(srcFile)) {
        return;
    }
    if (fs.existsSync(destFile)) {
        fs.unlinkSync(destFile);
        return;
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


///////////////////////////////////
///////////////////////////////////
///////////////////////////////////
///////////////////////////////////
///////////////////////////////////
///////////////////////////////////
///////////////////////////////////
///////////////////////////////////
///////////////////////////////////

