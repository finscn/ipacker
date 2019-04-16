var MaxRectsPacking = MaxRectsPacking || {};

(function(exports) {
    /**
     * @constructor
     * @param {Number} maxWidth - The max width of container
     * @param {Number} maxHeight - The max height of container
     * @param {Object} options - options of packing:
     *        allowRotate:  allow rotate the rects
     *        pot:  use power of 2 sizing
     *        padding:  the border padidng of each rectangle
     *        square:  use square size
     *        freeSpaceWidth: the width of original free space
     *        freeSpaceHeight: the height of original free space
     */

    var Packer = function(maxWidth, maxHeight, options) {
        Object.assign(this, {
            allowRotate: false,
            pot: false,
            square: false,
            padding: 0,
            freeSpaceWidth: 0,
            freeSpaceHeight: 0,
        });

        this.usedRectangles = [];
        this.freeRectangles = [];

        this.init(maxWidth, maxHeight, options);
    }

    Packer.prototype.init = function(maxWidth, maxHeight, options) {
        this.maxWidth = maxWidth;
        this.maxHeight = maxHeight;

        Object.assign(this, options);

        this.reset();
    }

    Packer.prototype.reset = function(maxWidth, maxHeight, options) {
        this.usedRectangles.length = 0;
        this.freeRectangles.length = 0;
        this.right = 0;
        this.bottom = 0;
    }

    /*
     *    packRule: the rule for packing
     *        ShortSideFit, LongSideFit, AreaFit, BottomLeft, ContactPoint
     *      if not pass (or pass null), will try all rules and find out the best one.
     *
     *    sortRule:  the rule for sorting the input rectangles
     *        SORT.widthDESC, SORT.heightDESC, SORT.shortSideDESC, SORT.longSideDESC, SORT.areaDESC, SORT.manhattanDESC,
     *        SORT.widthASC, SORT.heightASC, SORT.shortSideASC, SORT.longSideASC, SORT.areaASC, SORT.manhattanASC
     *      the default value is SORT.longSideDESC, you can pass your custom sort function.
     *      if pass `false`, will not do sort.
     *      if not pass (or pass null), will try all rules and find out the best one.
     */
    Packer.prototype.fit = function(rectangles, packRule, sortRule, _finding) {

        if (!packRule || (!sortRule && sortRule !== false)) {
            var bestRule = this.findBestRule(rectangles, packRule, sortRule);
            if (!bestRule) {
                return {
                    done: false,
                    fitCount: 0,
                };
            }
            packRule = bestRule.packRule;
            sortRule = bestRule.sortRule;
        }

        var realWidth = -1;
        var realHeight = -1;

        var result = {
            done: false,
            fitCount: 0,
            rects: [],
            packRule: packRule,
            sortRule: sortRule ? sortRule.name : null,
            width: realWidth,
            height: realHeight,
            realWidth: realWidth,
            realWidth: realHeight,
        };

        var inputCount = rectangles.length;

        var padding = this.padding || 0;
        var padding2 = padding * 2;

        if (padding) {
            for (var i = 0; i < inputCount; i++) {
                var rect = rectangles[i];
                rect.width += padding2;
                rect.height += padding2;
            }
        }

        if (_finding) {
            this._rectanglesInfo = this._rectanglesInfo || this.computeRectanglesInfo(rectangles);
        } else {
            this._rectanglesInfo = this.computeRectanglesInfo(rectangles);
        }

        (PrepareRule[packRule] || PrepareRule['default'])(rectangles, sortRule, this);

        this.processedIndex = -1;

        for (var i = 0; i < rectangles.length; i++) {
            var rect = rectangles[i];

            var freeRect = this.findBestFreeRect(packRule, rect.width, rect.height);

            if (!freeRect) {

                if (this.allowRotate) {
                    freeRect = this.findBestFreeRect(packRule, rect.height, rect.width);
                }

                if (!freeRect) {
                    if (this.expandFreeRectangles(rect.width, rect.height, packRule)) {
                        i--;
                        continue;
                    }
                    break;
                }
            }

            this._placeRectangle(freeRect);

            var fitInfo = {
                x: freeRect.x,
                y: freeRect.y,
                width: freeRect.width,
                height: freeRect.height,
            };

            if (rect.width !== freeRect.width || rect.height !== freeRect.height) {
                fitInfo.rotated = true;
            }

            realWidth = Math.max(realWidth, fitInfo.x + fitInfo.width);
            realHeight = Math.max(realHeight, fitInfo.y + fitInfo.height);

            rect.fitInfo = fitInfo;

            result.rects.push(rect);
            this.processedIndex = i;
        }

        var fitCount = result.rects.length;

        result.fitCount = fitCount;
        result.unfitCount = inputCount - fitCount;
        result.done = result.unfitCount === 0;

        if (padding) {
            for (var i = 0; i < fitCount; i++) {
                var rect = result.rects[i];
                rect.width -= padding2;
                rect.height -= padding2;

                var fitInfo = rect.fitInfo;
                fitInfo.x += padding;
                fitInfo.y += padding;
                fitInfo.width -= padding2;
                fitInfo.height -= padding2;
            }
        }

        result.realWidth = realWidth;
        result.realHeight = realHeight;
        result.realArea = realWidth * realHeight;

        var wp = Math.ceil(Math.log(realWidth) * Math.LOG2E);
        var hp = Math.ceil(Math.log(realHeight) * Math.LOG2E);

        result.binWidth = 2 ** wp;
        result.binHeight = 2 ** hp;
        result.binArea = result.binWidth * result.binHeight;

        if (this.pot) {
            result.width = result.binWidth;
            result.height = result.binHeight;
        } else {
            result.width = realWidth;
            result.height = realHeight;
        }

        if (this.square) {
            // Do or NOT Do ?
            // result.width = Math.max(result.width, result.height);
            // result.height = Math.max(result.width, result.height);
        }

        result.area = result.width * result.height;

        return result;
    }

    Packer.prototype.findBestFreeRect = function(packRule, width, height) {
        var bestFreeRect = null;

        this.freeRectangles.sort(FreeSpaceSortRule[packRule](width, height, this));

        for (var j = 0; j < this.freeRectangles.length; j++) {
            var freeRect = this.freeRectangles[j];
            if (freeRect.width >= width && freeRect.height >= height) {
                bestFreeRect = freeRect.clone();
                bestFreeRect.width = width;
                bestFreeRect.height = height;
                break;
            }
        }

        return bestFreeRect;
    }

    Packer.prototype.findBestRule = function(rectangles, packRule, sortRule) {
        var packRuleList;

        if (packRule) {
            packRuleList = [
                packRule
            ]
        } else {
            packRuleList = [
                exports.ShortSideFit,
                exports.LongSideFit,
                exports.AreaFit,
                exports.BottomLeft,
                exports.ContactPoint,
            ]
        }

        var sortRuleList;
        if (sortRule || sortRule === false) {
            sortRuleList = [sortRule]
        } else {
            sortRuleList = [
                SORT.widthDESC, SORT.heightDESC, SORT.shortSideDESC, SORT.longSideDESC, SORT.areaDESC, SORT.manhattanDESC,
                SORT.widthASC, SORT.heightASC, SORT.shortSideASC, SORT.longSideASC, SORT.areaASC, SORT.manhattanASC
            ]
        }

        var resultList = [];
        sortRuleList.forEach((sortRule, sortIndex) => {
            packRuleList.forEach((packRule, index) => {
                this.reset();
                var result = this.fit(rectangles, packRule, sortRule, true);
                result._packRuleIndex = index;
                result._sortRuleIndex = sortIndex;

                if (result.done) {
                    resultList.push(result);
                    // console.log(result.packRule, result.realWidth, result.realHeight);
                }
            });
        })


        this.reset();

        // resultList.sort((a, b) => {
        //     let d = 0;
        //     d = d || a.binArea - b.binArea;
        //     d = d || a.realArea - b.realArea;
        //     d = d || a.area - b.area;
        //     return d;
        // });

        resultList.sort((a, b) => {
            let d = 0;
            d = d || a.area - b.area;
            d = d || a.binArea - b.binArea;
            d = d || a.realArea - b.realArea;
            return d;
        });

        var bestRsult = resultList[0];

        if (!bestRsult) {
            return null;
        }

        var packRule = packRuleList[bestRsult._packRuleIndex]
        var sortRule = sortRuleList[bestRsult._sortRuleIndex];

        return {
            packRule: packRule,
            sortRule: sortRule,
        };
    }

    Packer.prototype._placeRectangle = function(rect) {
        var numRectanglesToProcess = this.freeRectangles.length;
        for (var i = 0; i < numRectanglesToProcess; i++) {
            if (this._splitFreeNode(this.freeRectangles[i], rect)) {
                this.freeRectangles.splice(i, 1);
                i--;
                numRectanglesToProcess--;
            }
        }

        this._pruneFreeList();
        this.usedRectangles.push(rect);
    }

    Packer.prototype._splitFreeNode = function(freeNode, rect) {
        var freeRectangles = this.freeRectangles;
        // Test with SAT if the Rectangles even intersect.

        var outOfHoriz = rect.x >= freeNode.x + freeNode.width || rect.x + rect.width <= freeNode.x;
        var outOfVert = rect.y >= freeNode.y + freeNode.height || rect.y + rect.height <= freeNode.y;

        if (outOfHoriz || outOfVert) {
            return false;
        }

        var newNode;
        // New node at the top side of the used node.
        if (rect.y > freeNode.y) {
            newNode = freeNode.clone();
            newNode.height = rect.y - newNode.y;
            freeRectangles.push(newNode);
        }

        // New node at the bottom side of the used node.
        if (rect.y + rect.height < freeNode.y + freeNode.height) {
            newNode = freeNode.clone();
            newNode.y = rect.y + rect.height;
            newNode.height = freeNode.y + freeNode.height - newNode.y;
            freeRectangles.push(newNode);
        }
        // }

        // New node at the left side of the used node.
        if (rect.x > freeNode.x) {
            newNode = freeNode.clone();
            newNode.width = rect.x - newNode.x;
            freeRectangles.push(newNode);
        }

        // New node at the right side of the used node.
        if (rect.x + rect.width < freeNode.x + freeNode.width) {
            newNode = freeNode.clone();
            newNode.x = rect.x + rect.width;
            newNode.width = freeNode.x + freeNode.width - newNode.x;
            freeRectangles.push(newNode);
        }

        return true;
    }

    Packer.prototype._pruneFreeList = function() {
        var freeRectangles = this.freeRectangles;
        for (var i = 0; i < freeRectangles.length; i++) {
            for (var j = i + 1; j < freeRectangles.length; j++) {
                if (Rect.isContainedIn(freeRectangles[i], freeRectangles[j])) {
                    freeRectangles.splice(i, 1);
                    i--;
                    break;
                }
                if (Rect.isContainedIn(freeRectangles[j], freeRectangles[i])) {
                    freeRectangles.splice(j, 1);
                    j--;
                }
            }
        }
    }

    Packer.prototype.expandFreeRectangles = function(width, height, packRule) {
        if (this.right >= this.maxWidth && this.bottom >= this.maxHeight) {
            return false;
        }

        var expandX = width;
        var expandY = height;

        var expand = false;
        var addNewRect = false;
        var rightList = [];
        var bottomList = [];

        if (this.freeRectangles.length === 0) {

            addNewRect = true;

        } else {

            this.freeRectangles.forEach(rect => {
                if (rect.x + rect.width === this.right) {
                    rightList.push(rect);
                }
                var bottom = rect.y + rect.height;
                if (bottom === this.bottom) {
                    bottomList.push(rect);
                }
            });
            rightList.sort(function(a, b) {
                return a.width - b.width
            })
            bottomList.sort(function(a, b) {
                return a.height - b.height
            })

            var rectRight = rightList.find(function(rect) {
                return rect.height >= height;
            });
            var rectBottom = bottomList.find(function(rect) {
                return rect.width >= width;
            });

            if (rectRight) {
                expandX = width - rectRight.width;
            }
            if (rectBottom) {
                expandY = height - rectBottom.height;
            }
        }

        if (this.square) {
            expandX = Math.min(expandX || expandY, expandY || expandX);
            expandY = expandX;
        }

        var newRight = Math.min(this.maxWidth, this.right + expandX);
        var newBottom = Math.min(this.maxHeight, this.bottom + expandY);

        var pow2X = Math.ceil(Math.log(this.right) * Math.LOG2E);
        var pow2Y = Math.ceil(Math.log(this.bottom) * Math.LOG2E);
        var deltaPow2X = Math.ceil(Math.log(newRight) * Math.LOG2E) - pow2X;
        var deltaPow2Y = Math.ceil(Math.log(newBottom) * Math.LOG2E) - pow2Y;

        var firstX = deltaPow2X < deltaPow2Y || areaX <= areaY;

        expandX = newRight - this.right;
        expandY = newBottom - this.bottom;

        var areaX = expandX * this.bottom;
        var areaY = this.right * expandY;

        if (expandX > 0 && (firstX || this.square)) {
            if (addNewRect) {
                this.freeRectangles.push(new Rect(this.right, 0, expandX, this.bottom));
                expand = true;
            } else {
                rightList.forEach(function(rect) {
                    rect.width += expandX;
                    expand = true;
                })
            }
            this.right = newRight;
        }

        if (expandY > 0 && (!firstX || this.square)) {
            if (addNewRect) {
                this.freeRectangles.push(new Rect(0, this.bottom, this.right, expandY));
                expand = true;
            } else {
                bottomList.forEach(function(rect) {
                    rect.height += expandY;
                    expand = true;
                })
            }
            this.bottom = newBottom;
        }

        return expand;
    }


    Packer.prototype.cloneRectangles = function(rectangles) {
        var newRectangles = [];

        rectangles.forEach((r, index) => {
            newRectangles.push({
                x: r.x,
                y: r.y,
                width: r.width,
                height: r.height,
            });
        });

        return newRectangles;
    }

    Packer.prototype.computeRectanglesInfo = function(rectangles) {
        var count = rectangles.length;
        var totalArea = 0;
        var totalWidth = 0;
        var totalHeight = 0;

        var maxWidth = -Infinity;
        var maxHeight = -Infinity;
        var minWidth = Infinity;
        var minHeight = Infinity;

        rectangles.forEach(function(rect) {
            var w = rect.width;
            var h = rect.height;

            totalArea += w * h;
            totalWidth += w;
            totalHeight += h;

            minWidth = Math.min(minWidth, w);
            minHeight = Math.min(minHeight, h);
            maxWidth = Math.max(maxWidth, w);
            maxHeight = Math.max(maxHeight, h);
        });

        var info = {
            count: count,

            totalArea: totalArea,
            totalWidth: totalWidth,
            totalHeight: totalHeight,

            minWidth: minWidth,
            minHeight: minHeight,
            minSide: Math.min(minWidth, minHeight),

            maxWidth: maxWidth,
            maxHeight: maxHeight,
            maxSide: Math.max(maxWidth, maxHeight),

        };

        var rat = info.totalWidth / info.totalHeight;
        var hySide = Math.ceil(Math.sqrt(info.totalArea));
        var hyHeight = Math.ceil(Math.sqrt(info.totalArea / rat));
        var hyWidth = Math.ceil(hyHeight * rat);

        info.hySide = hySide;
        info.hyWidth = hyWidth;
        info.hyHeight = hyHeight;

        // console.log(info)

        return info;
    }

    //////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////

    var PrepareRule = {

        // TODO: with different pack rules , use different prepare rules.

        'default': function(rectangles, sortRule, packer) {

            if (sortRule !== false) {
                sortRule = sortRule || SORT.longSideDESC;
                rectangles.sort(sortRule);
            }

            var info = packer._rectanglesInfo;

            var estimateWidth;
            var estimateHeight;

            if (packer.square) {
                // TODO
                estimateWidth = Math.min(info.hySide, Math.min(packer.maxWidth, packer.maxHeight));
                estimateHeight = estimateWidth;
            } else {
                // TODO
                estimateWidth = Math.min(info.hyWidth, packer.maxWidth);
                estimateHeight = Math.min(info.hyHeight, packer.maxHeight);
            }

            packer.right = packer.freeSpaceWidth || estimateWidth;
            packer.bottom = packer.freeSpaceHeight || estimateHeight;

            packer.right = Math.min(packer.maxWidth, packer.right);
            packer.bottom = Math.min(packer.maxHeight, packer.bottom);

            packer.freeRectangles.push(new Rect(0, 0, packer.right, packer.bottom));
        },
    }

    var FreeSpaceSortRule = {
        'ShortSideFit': function(width, height, packer) {
            return function(a, b) {
                var x0 = a.width - width;
                var y0 = a.height - height;
                var x1 = b.width - width;
                var y1 = b.height - height;

                var shortSide0 = Math.min(x0, y0);
                var shortSide1 = Math.min(x1, y1);

                var d = shortSide0 - shortSide1;
                if (d) {
                    return d;
                }

                var longSide0 = Math.min(x0, y0);
                var longSide1 = Math.min(x1, y1);

                return longSide0 - longSide1;
            }
        },

        'LongSideFit': function(width, height, packer) {
            return function(a, b) {
                var x0 = a.width - width;
                var y0 = a.height - height;
                var x1 = b.width - width;
                var y1 = b.height - height;

                var longSide0 = Math.max(x0, y0);
                var longSide1 = Math.max(x1, y1);

                var d = longSide1 - longSide0;
                if (d) {
                    return d;
                }

                var shortSide0 = Math.min(x0, y0);
                var shortSide1 = Math.min(x1, y1);

                return shortSide1 - shortSide0;
            }
        },

        'AreaFit': function(width, height, packer) {
            return function(a, b) {
                var x0 = a.width - width;
                var y0 = a.height - height;
                var x1 = b.width - width;
                var y1 = b.height - height;

                var area0 = x0 * y0;
                var area1 = x1 * y1;

                return area0 - area1;
            }
        },

        'BottomLeft': function(width, height, packer) {
            return function(a, b) {
                var topSideY0 = a.y + height;
                var topSideY1 = b.y + height;

                var d = topSideY0 - topSideY1;
                if (d) {
                    return d;
                }

                return a.x - b.x;
            }
        },

        'ContactPoint': function(width, height, packer) {
            return function(a, b) {
                var score0 = _contactPointScoreNode(a.x, a.y, width, height, packer);
                var score1 = _contactPointScoreNode(b.x, b.y, width, height, packer);
                return score1 - score0;
            }
        },
    };

    function _contactPointScoreNode(x, y, width, height, packer) {
        var usedRectangles = packer.usedRectangles;

        var score = 0;

        if (x === 0 || x + width === packer.maxWidth) {
            score += height;
        }
        if (y === 0 || y + height === packer.maxHeight) {
            score += width;
        }
        for (var i = 0; i < usedRectangles.length; i++) {
            var rect = usedRectangles[i];
            if (rect.x === x + width || rect.x + rect.width === x) {
                score += _commonIntervalLength(rect.y, rect.y + rect.height, y, y + height);
            }
            if (rect.y === y + height || rect.y + rect.height === y) {
                score += _commonIntervalLength(rect.x, rect.x + rect.width, x, x + width);
            }
        }
        return score;
    }

    function _commonIntervalLength(start0, end0, start1, end1) {
        if (end0 < start1 || end1 < start0) {
            return 0;
        }
        return Math.min(end0, end1) - Math.max(start0, start1);
    }

    //////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////

    var SORT = {
        widthASC: function(a, b) {
            return a.width - b.width;
        },
        widthDESC: function(a, b) {
            return b.width - a.width;
        },
        heightASC: function(a, b) {
            return a.height - b.height;
        },
        heightDESC: function(a, b) {
            return b.height - a.height;
        },
        shortSideASC: function(a, b) {
            var sideA = Math.min(a.width, a.height);
            var sideB = Math.min(b.width, b.height);
            return sideA - sideB;
        },
        shortSideDESC: function(a, b) {
            var sideA = Math.min(a.width, a.height);
            var sideB = Math.min(b.width, b.height);
            return sideB - sideA;
        },
        longSideASC: function(a, b) {
            var sideA = Math.max(a.width, a.height);
            var sideB = Math.max(b.width, b.height);
            return sideA - sideB;
        },
        longSideDESC: function(a, b) {
            var sideA = Math.max(a.width, a.height);
            var sideB = Math.max(b.width, b.height);
            return sideB - sideA;
        },
        areaASC: function(a, b) {
            var areaA = a.width * a.height;
            var areaB = b.width * b.height;
            return areaA - areaB;
        },
        areaDESC: function(a, b) {
            var areaA = a.width * a.height;
            var areaB = b.width * b.height;
            return areaB - areaA;
        },
        manhattanASC: function(a, b) {
            var manhattanA = a.width + a.height;
            var manhattanB = b.width + b.height;
            return manhattanA - manhattanB;
        },
        manhattanDESC: function(a, b) {
            var manhattanA = a.width + a.height;
            var manhattanB = b.width + b.height;
            return manhattanB - manhattanA;
        },
    }

    for (var ruleName in SORT) {
        SORT[ruleName].name = ruleName;
    }

    //////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////

    var Rect = function(x, y, width, height) {
        this.x = x || 0;
        this.y = y || 0;
        this.width = width || 0;
        this.height = height || 0;
    }

    Rect.prototype.clone = function() {
        return new Rect(this.x, this.y, this.width, this.height);
    }

    Rect.isContainedIn = function(rectA, rectB) {
        return rectA.x >= rectB.x && rectA.y >= rectB.y &&
            rectA.x + rectA.width <= rectB.x + rectB.width &&
            rectA.y + rectA.height <= rectB.y + rectB.height;
    }


    //////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////

    // Positions the Rectangle against the short side of a free Rectangle into which it fits the best.
    exports.ShortSideFit = 'ShortSideFit';

    // Positions the Rectangle against the long side of a free Rectangle into which it fits the best.
    exports.LongSideFit = 'LongSideFit';

    // Positions the Rectangle into the smallest free Rectangle into which it fits.
    exports.AreaFit = 'AreaFit';

    // Does the Tetris placement.
    exports.BottomLeft = 'BottomLeft';

    // Choosest the placement where the Rectangle touches other Rectangles as much as possible.
    exports.ContactPoint = 'ContactPoint';

    exports.SORT = SORT;
    exports.Packer = Packer;

    if (typeof module !== "undefined" && module.exports) {
        module.exports = MaxRectsPacking;
    }

}(MaxRectsPacking));
