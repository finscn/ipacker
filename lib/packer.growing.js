/******************************************************************************

This is a binary tree based bin packing algorithm that is more complex than
the simple Packer (packer.js). Instead of starting off with a fixed width and
height, it starts with the width and height of the first block passed and then
grows as necessary to accomodate each subsequent block. As it grows it attempts
to maintain a roughly square ratio by making 'smart' choices about whether to
grow right or down.

When growing, the algorithm can only grow to the right OR down. Therefore, if
the new block is BOTH wider and taller than the current target then it will be
rejected. This makes it very important to initialize with a sensible starting
width and height. If you are providing sorted input (largest first) then this
will not be an issue.

A potential way to solve this limitation would be to allow growth in BOTH
directions at once, but this requires maintaining a more complex tree
with 3 children (down, right and center) and that complexity can be avoided
by simply chosing a sensible starting block.

Best results occur when the input blocks are sorted by height, or even better
when sorted by max(width,height).

Inputs:
------

  blocks: array of any objects that have .w and .h attributes

Outputs:
-------

  marks each block that fits with a .fit attribute pointing to a
  node with .x and .y coordinates

Example:
-------

  var blocks = [
    { w: 100, h: 100 },
    { w: 100, h: 100 },
    { w:  80, h:  80 },
    { w:  80, h:  80 },
    etc
    etc
  ];

  var packer = new GrowingPacker();
  packer.fit(blocks);

  for(var n = 0 ; n < blocks.length ; n++) {
    var block = blocks[n];
    if (block.fit) {
      Draw(block.fit.x, block.fit.y, block.w, block.h);
    }
  }


******************************************************************************/

"use strict";

var GrowingPacker = function(width, height) {
    this.maxWidth = width || 2048;
    this.maxHeight = height || 2048;
};

GrowingPacker.prototype = {

    maxWidth: 0,
    maxHeight: 0,
    index: 0,
    rightMaxY: 0,
    downMaxX: 0,

    fit: function(blocks) {

        var n, node, block, len = blocks.length;
        var w = len > 0 ? blocks[0].w : 0;
        var h = len > 0 ? blocks[0].h : 0;
        if (len<1 || w > this.maxWidth || h > this.maxHeight) {
            return false;
        }

        this.root = {
            x: 0,
            y: 0,
            w: w,
            h: h
        };

        this.index = 0;
        this.downMaxX = w;
        this.rightMaxY = h;
        this.blocks = blocks;
        this.fitted = {};
        this.blockMap = {};
        for (n = 0; n < len; n++) {
            block = blocks[n];
            block._sn_ = n;
            this.blockMap[n] = block;
        }
        for (n = 0; n < len; n++) {
            block = blocks[n];
            if (this.fitted[block._sn_]) {
                continue;
            }
            if (node = this.findNode(this.root, block.w, block.h)) {
                block.fit = this.splitNode(node, block.w, block.h);
            } else {
                block.fit = null;
                // if (this.downMaxX > 0 && this.rightMaxY > 0) {
                // if (n>0){
                    // this.tryFillBlank();
                // }
                // }
                if (!block.fit) {
                    block.fit = this.growNode(block.w, block.h);
                }
            }
            if (block.fit) {
                this.fitted[block._sn_] = true;
            }
        }
        return this.root;
    },

    tryFillBlank: function() {
        var width = this.root.w - this.downMaxX;
        var height = this.root.h - this.rightMaxY;
        if (width<1||height<1){
            return;
        }
        var restBlocks = [];
        for (var n = 0; n < this.blocks.length; n++) {
            var block = this.blocks[n];
            // if (this.fitted[block._sn_]) {
            if (block.w > width || block.h > height || this.fitted[block._sn_]) {
                continue;
            }
            restBlocks.push({
                _osn_: block._sn_,
                w: block.w,
                h: block.h,
            });
        }
        if (restBlocks.length < 1) {
            return;
        }
        console.log(this.downMaxX, this.rightMaxY, width, height, restBlocks.length);
        var packer = new GrowingPacker(width, height);
        var _root = packer.fit(restBlocks);
        for (var n = 0; n < restBlocks.length; n++) {
            var rblock = restBlocks[n];
            if (rblock.fit) {
                this.blockMap[rblock._osn_].fit = {
                    x: rblock.fit.x + this.downMaxX,
                    y: rblock.fit.y + this.rightMaxY,
                    index: this.index++
                }
                this.fitted[rblock._osn_] = true;
            }
        }
    },

    findNode: function(root, w, h) {
        if (root.used) {
            var node = this.findNode(root.right, w, h);
            if (node) {
                if (root.inDown) {
                    node.inDown = true;
                } else {
                    node.inRight = true;
                }
                return node;
            }
            node = this.findNode(root.down, w, h);
            if (node) {
                if (root.inRight) {
                    node.inRight = true;
                } else {
                    node.inDown = true;
                }
                return node;
            }
        } else if ((w <= root.w) && (h <= root.h)) {
            return root;
        } else {
            return null;
        }
    },

    splitNode: function(node, w, h) {
        node.used = true;
        node.down = {
            x: node.x,
            y: node.y + h,
            w: node.w,
            h: node.h - h
        };
        node.right = {
            x: node.x + w,
            y: node.y,
            w: node.w - w,
            h: h
        };
        if (node.inRight) {
            this.rightMaxY = Math.max(this.rightMaxY, node.y + h);
        } else if (node.inDown) {
            this.downMaxX = Math.max(this.downMaxX, node.x + w);
        }
        node.index = this.index++;
        return node;
    },

    growNode: function(w, h) {
        var binWidth = Math.pow(2, Math.ceil(Math.log(this.root.w) / Math.log(2)));
        var binHeight = Math.pow(2, Math.ceil(Math.log(this.root.h) / Math.log(2)));
        var newW = this.root.w + w,
            newH = this.root.h + h;
        var canGrowRight = (h <= this.root.h) && newW <= this.maxWidth;
        var canGrowDown = (w <= this.root.w) && newH <= this.maxHeight;

        if (!canGrowRight && !canGrowDown) {
            return null;
        }
        var shouldGrowRight, shouldGrowDown;
        var bestRight, bestDown;

        if (canGrowRight) {
            if (newW <= binWidth && newH > binHeight) {
                shouldGrowRight = true;
                bestRight = true;
            } else {
                // attempt to keep square-ish by growing right when height is much greater than width
                shouldGrowRight = this.root.h >= newW;
            }
        }

        if (canGrowDown) {
            if (newH <= binHeight && newW > binWidth) {
                shouldGrowDown = true;
                bestDown = true;
            } else {
                // attempt to keep square-ish by growing down  when width  is much greater than height
                shouldGrowDown = this.root.w >= newH;
            }
        }

        if (bestRight && bestDown) {
            if (newH < newW) {
                bestRight = false;
            } else {
                bestDown = false;
            }
        }
        if (shouldGrowRight && shouldGrowDown) {
            if (newH < newW) {
                shouldGrowRight = false;
            } else {
                shouldGrowDown = false;
            }
        }
        if (canGrowRight && canGrowDown) {
            if (newH < newW) {
                canGrowRight = false;
            } else {
                canGrowDown = false;
            }
        }

        if (bestRight)
            return this.growRight(w, h);
        else if (bestDown)
            return this.growDown(w, h);
        else if (shouldGrowRight)
            return this.growRight(w, h);
        else if (shouldGrowDown)
            return this.growDown(w, h);
        else if (canGrowRight)
            return this.growRight(w, h);
        else if (canGrowDown)
            return this.growDown(w, h);
        else
            return null; // need to ensure sensible root starting size to avoid this happening
    },

    growRight: function(w, h) {
        this.root = {
            used: true,
            x: 0,
            y: 0,
            w: this.root.w + w,
            h: this.root.h,
            down: this.root,
            right: {
                x: this.root.w,
                y: 0,
                w: w,
                h: this.root.h
            }
        };
        var node = this.findNode(this.root, w, h);
        if (node) {
            node.inRight = true;
            this.downMaxX = Math.max(this.downMaxX, node.x + w);
            this.rightMaxY = 0;
            return this.splitNode(node, w, h);
        } else {
            return null;
        }
    },

    growDown: function(w, h) {
        this.root = {
            used: true,
            x: 0,
            y: 0,
            w: this.root.w,
            h: this.root.h + h,
            down: {
                x: 0,
                y: this.root.h,
                w: this.root.w,
                h: h
            },
            right: this.root
        };
        var node = this.findNode(this.root, w, h);
        if (node) {
            node.inDown = true;
            this.downMaxX = 0;
            this.rightMaxY = Math.max(this.rightMaxY, node.y + h);
            return this.splitNode(node, w, h);
        } else
            return null;
    }

}

if (typeof exports != "undefined") {
    exports.GrowingPacker = GrowingPacker;
}
