iPacker
=======

A  node.js  tools  for packing some images into one.


------------------

### Getting started

First, download and install [ImageMagick](http://www.imagemagick.org/). 

In Mac OS X, you can simply use Homebrew and do:

```
brew install imagemagick
```


Second, install [Node.js](http://nodejs.org).


Then, run
```
npm install
```

### Help Info

```
node ipacker.js --help
```

------------------

### Simple Examples

* Pack all in one

1) put all images into  "./input"  dir.

2) run:

```
node ipacker.js  -p --name all-in-one
```
Note: --name <packname> , the packname doesn't include ext-name.

3) the all-in-one.png  will be created in "./output/pack". 

4) the mapping-info in "./output/pack/img-mapping"



### More Advanced Examples

coming soon ...








