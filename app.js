(function(win, doc, nav) {
    "use strict";
    
    // Setup main variable for getting video feed
    nav.getUserMedia = nav.getUserMedia || nav.oGetUserMedia || nav.msGetUserMedia || nav.mozGetUserMedia || nav.webkitGetUserMedia;

    // Setup shared variables
    var video, width, height, sourceContext, blendContext, timeout, lastImageData, dump;
    var areaWidth = 40, posY = 0, posX = 0, threshold = 10;
    var frame = 0;
        
    /**
     * Function that does all our setup tasks
     */
    function initialize() {
        
        // Set up video source
        video = doc.getElementById("videoSource");
        width = video.width;
        height = video.height;
        
        // Set up our source canvas that copies the video stream        
        var sourceCanvas = doc.getElementById("canvasSource");
        sourceContext = sourceCanvas.getContext("2d");
        
        // Set up the canvas we will use to calculate differences
        var blendCanvas = doc.getElementById("canvasBlend");
        blendContext = blendCanvas.getContext("2d");
        
        // Create place for Snapshots to be dumped
        dump = doc.getElementById("dump");

        // Get our webcam stream
        nav.getUserMedia({
            video: {
                mandatory: {
                    minWidth: 1280,
                    minHeight: 720,
                    minFrameRate: 60
                }
            },
            audio: false
        }, function(stream) {
            // webcam is ready
            video.src = URL.createObjectURL(stream);
            video.play();
        }, function() {
            // No connection to webcam
            alert("You need to allow access to your webcam for this site to work properly.")
        });
        
        // Set up all our control buttons
        var startButton = doc.getElementById("start");
        startButton.addEventListener("click", function() {
            update();
        });

        var stopButton = doc.getElementById("stop");
        stopButton.addEventListener("click", function() {
            // Empty all our canvases
            sourceContext.clearRect(0, 0, width, height);
            blendContext.clearRect(0, 0, width, height);
            
            // Kill the timout that triggers our update loop
            clearTimeout(timeout);
        });

        var clearButton = doc.getElementById("clear");
        clearButton.addEventListener("click", function() {
            // Loop through and wipe out all the snapshots in the dump
            while (dump.hasChildNodes()) {
                dump.removeChild(dump.firstChild);
            }
        });
        
        var updateButton = doc.getElementById("update");
        updateButton.addEventListener("click", function() {
            // Read in the threshold from input
            var thresholdInput = doc.getElementById("threshold");
            if (thresholdInput.value) {
                threshold = Number(thresholdInput.value);
            }

            // Read in the detection area from input
            var areaWidthInput = doc.getElementById("areaWidth");
            if (areaWidthInput.value) {
                areaWidth = Number(areaWidthInput.value);
            }

            // Read in the X position of the detection area from input   
            var posXInput = doc.getElementById("posX");
            if (posXInput.value) {
                posX = Number(posXInput.value) - (areaWidth / 2);
            }
        });
    }    


    /**
     * This function is our update loop as is called 60 times a second
     * in order to refresh fast enough to capture motion.
     */
    function update() {
        frame++;
        // Take a picture
        draw();
        
        // Did something change?
        blend();
        
        // Look for ninjas
        checkAreas();
        
        // Play it again, Sam!
        timeout = setTimeout(update, 1000/60);
    }
    
    /**
     * Takes a still frame from the video source and puts it into
     * our source canvas.
     */
    function draw() {
        
        // Draw temporary image from video
        sourceContext.drawImage(video, 0, 0, width, height);  
        
        // Show the user where exactly we are looking for motion
        sourceContext.beginPath();
        sourceContext.lineWidth="1";
        sourceContext.strokeStyle="white";
        sourceContext.rect(posX, posY, areaWidth, height); 
        sourceContext.stroke();            
    }
    
    /**
     * Quick and dirty helper function for getting absolute value of a
     * number.
     */
    function fastAbs(value) {
        
        // equivalent to Math.abs();
        return (value ^ (value >> 31)) - (value >> 31);
    }

    /**
     * Helper function for looking at an images byte array and performing a subtraction between the two. This
     * helps use know if there was a change between the current image and the last.
     */
    function difference(target, data1, data2) {
        
        // If the two byte arrays aren't the same length then get out
        if (data1.length != data2.length) return null;
        
        // Loop through the array and start subtracting
        var i = 0;
        while (i < (data1.length * 0.25)) {
            // Note to Readers: Just in case this is confusing, we are doing a null check in line with the variable
            // assignment. I know, readability was kind of sacrificed but..... it is WAY cleaner.
            
            // Red Channel
            target[4 * i] = (data1[4 * i] == 0) ? 0 : fastAbs(data1[4 * i] - data2[4 * i]);
            // Green Channel
            target[4 * i + 1] = (data1[4 * i + 1] == 0) ? 0 : fastAbs(data1[4 * i + 1] - data2[4 * i + 1]);
            // Blue Channel
            target[4 * i + 2] = (data1[4 * i + 2] == 0) ? 0 : fastAbs(data1[4 * i + 2] - data2[4 * i + 2]);
            // Who cares about alpha channel? I don't.
            target[4 * i + 3] = 0xFF;
            ++i;
        }
    }
    
    /**
     * This function takes the two frames from the canvases and gets their difference and saves it to
     * another canvas.
     */
    function blend() {
        console.log("blend - " + frame);
        // Take the current webcam image data
        var sourceData = sourceContext.getImageData(0, 0, width, height);
        
        // Create an image if the previous image doesn’t exist
        if (!lastImageData){
             lastImageData = sourceContext.getImageData(0, 0, width, height);
        }
        
        // Create an empty ImageData instance to receive the blended result
        var blendedData = blendContext.createImageData(width, height);
        
        // Blend the 2 images from the canvases
        difference(blendedData.data, sourceData.data, lastImageData.data);
        
        // Draw the result in a canvas
        blendContext.putImageData(blendedData, 0, 0);
        
        // Store the current webcam image for the next run through
        lastImageData = sourceData;
    }
    
    /**
     * This is the function that actually checks for motion. By looking in the specified area for pixel values that aren't
     * black we know that there was a change that took place.
     */
    function checkAreas() {
        console.log("check - " + frame);
        // Get the pixels in the detection area from the blended image
        var blendedData = blendContext.getImageData(
            posX,
            posY,
            areaWidth,
            height);
            
        var i = 0;
        var average = 0;
        
        // Loop over the pixels in the area
        while (i < (blendedData.data.length / 4)) {
            
            // Take the average between the different color channels
            average += (blendedData.data[i*4] + blendedData.data[i*4+1] + blendedData.data[i*4+2]) / 3;
            ++i;
        }
        
        // Calculate an average between all the pixels averages within the entire detection area
        average = Math.round(average / (blendedData.data.length / 4));
        if (average > threshold) {
            // If greater than our threshold, consider a movement detected and save it
            var sourceData = sourceContext.getImageData(0, 0, width, height);            
            var canvasSnapShot = doc.getElementById("canvasSnapShot");
            var snapshotContext = canvasSnapShot.getContext("2d");
            snapshotContext.putImageData(sourceData, 0, 0);
            
            // Put the detected image in the dumping ground
            takeSnapshot(canvasSnapShot);
        }
    }
    
    /**
     * Helper function to take data from a canvas and turn it into an image on the page.
     */
    function takeSnapshot (canvas) {
        var image = new Image();
        image.src = canvas.toDataURL("image/jpg");
        dump.appendChild(image);
    }
    

    // Get this party started
    addEventListener("DOMContentLoaded", initialize);
})(window, document, navigator);
