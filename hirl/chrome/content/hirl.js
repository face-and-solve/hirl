/**
 * hirl.js
 * Used by hirl.xul in the Mozilla Firefox extension, HIRL.
 * This file encapsulates all functionality of the HIRL system.
 * It uses third party software jslib for file reading/writing.
 */
jslib.init(this);
include (jslib_file);
file = new File("c:\\tmp\\index.dat");
filemap = new File("c:\\tmp\\map.dat");
stopw = new File("c:\\tmp\\stop_words.dat");
idf = new File("c:\\tmp\\idf.dat");
learn = new File("c:\\tmp\\learn.dat");
var tfCount;
var idfCount;
var lookupTable;
var url_map;
var url_count;
var learned_data;	  //user specified learned queries
var stop_words;       //words populated from file, these words are not indexed
var selectiveness;    //how many times a keyword must appear on a page to index it
var learn_on;
window.addEventListener("load", function() { myExtension.init(); }, false);
window.addEventListener("close", function() { myExtension.close(); }, false);

/**
 * myExtension is a variable that encapsulates the functionality of the HIRL bar which is defined in hirl.xul
 */
//TODO: fix small bug in computation of tf/idf scores.
//As it is now, if the content of a page changes it will be re-indexed in the tf/idf count
//this is because we look through by each term in the document for this indexing
var myExtension = {
    /**
     * init is called when the Mozilla Firefox browser is opened.  
     * It initializes all the arrays of data. 
     * Then, it reads in all persistent information from the local file system (C:\tmp). 
     * Then it sets a listener to wait for a page load.
     */
  init: function() {
  	
  	tfCount = new Array();
  	idfCount = new Array();
  	/**
  	 * maps urls to numbers
  	 */
  	lookupTable = new Array(); 
  	 /**
  	 * maps numbers to urls
  	 */
  	url_map = new Array();
  	learned_data = new Array();
  	stop_words = new Array();
  	url_count = 0;
  	learn_on = true;
  	selectiveness = 1;
	file.open("r");
	filemap.open("r");
	stopw.open("r");
	idf.open("r");
    learn.open("r");
	var mappings = new Array();
	mappings = file.readAllLines();
	var filemappings = new Array();
	filemappings = filemap.readAllLines();
	var stop_mappings = new Array();
	stop_mappings = stopw.readAllLines();
	var idf_mappings = new Array();
	idf_mappings = idf.readAllLines();
	var learn_mappings = new Array();
	learn_mappings = learn.readAllLines();
	file.close();
	filemap.close();
	stopw.close();
	idf.close();
	learn.close();
	for(var i in mappings){
	    /**
	     * File is written with search word mapped to string of tf scores and their corresponding documents 
	     */
		if(mappings[i]){		//sometimes we read an empty line which is undefined
			var duple = new Array();
			duple = mappings[i].split(" ");
			tfCount[duple[0]] = duple[1];
		}
	}
	for(var i in filemappings){
	    if(i == 0){
	        url_count = filemappings[i];
	    }
	    else{
    	    if(filemappings[i]){
	            var duple = new Array();
	            duple = filemappings[i].split(" ");
	            lookupTable[duple[1]] = duple[0];
	            url_map[duple[0]] = duple[1];
	       }
	    }
	}
	for(var i in stop_mappings){
	    stop_words[stop_mappings[i]] = 1;
	}
	
	for(var i in idf_mappings){
	    /**
	     * File is written with idf word mapped to number of documents in which the word appears 
	     */
		if(idf_mappings[i]){		//sometimes we read an empty line which is undefined
			var duple = new Array();
			duple = idf_mappings[i].split(" ");
			idfCount[duple[0]] = duple[1];
		}
	}
	for(var i in learn_mappings){
	    /**
	     * File is written with learned query mapped to url 
	     */
		if(learn_mappings[i]){		//sometimes we read an empty line which is undefined
			var duple = new Array();
			duple = learn_mappings[i].split(" ");
			learned_data[duple[0]] = duple[1];
		}
	}
    document.getElementById("appcontent").addEventListener("load", this.onPageLoad, true);
  },

    /**
    * This function is called every time a page loads. It indexes the title and body of the page.
    * It counts the term frequency for each term in the page above the initialized selectiveness.
    * It double counts words in the title of the page because they are considered more important. 
    */
      onPageLoad: function(aEvent) {
          if(learn_on){
              //we don't index google search pages
              if(!(/(.)*google(.)*/.test(window._content.document.URL))){
                 //save the inner html at the key of the url we just loaded
                var titleString = window._content.document.title;
                var terms = new Array();
                terms = titleString.split(" ");
        
                var pageHTML = window._content.document.body.innerHTML;
                pageHTML = parseHTML(pageHTML);
                var html_terms = new Array();
                html_terms = pageHTML.split(/\s+/);
        
                html_terms = html_terms.concat(terms);
                var myCount = new Array();
                var count = 0;    //overall term count in document
                //these for loops will compute the counts for each term in the document/title
                for(var i in html_terms){
                  if(stop_words[html_terms[i].toLowerCase()] || (html_terms[i].length > 15)){
                    continue;
                  }
                  if(!myCount[html_terms[i].toLowerCase()]){
                    myCount[html_terms[i].toLowerCase()] = 0;
                    count++;    //if the term is not located in myCount, that's when we count it
                  }
                  myCount[html_terms[i].toLowerCase()]++;
                }
                //double count terms from the title because they are more important
                for(var i in terms){
                 if(stop_words[terms[i].toLowerCase()] || (terms[i].length > 15)){
                    continue;
                 }
                 myCount[terms[i].toLowerCase()]++;
                }
    
          for(var i in myCount){
            /**
            * only keep keywords that appear more than selectiveness
            */
            if(myCount[i] > selectiveness){
                if(!tfCount[i])
                    tfCount[i] = "";
                if(!idfCount[i])
                    idfCount[i] = 0;    
                if(!lookupTable[window._content.document.URL]){
                    url_count++;
                    url_map[url_count] = window._content.document.URL;       //maps numbers to urls
                    lookupTable[window._content.document.URL] = url_count;   //maps urls to numbers
                }
                /**
                 * If we haven't put this in the tfCount before for this term and website, then do it.
                 */
                var alreadyIndexed = false;
    	        var relevant_scores_per_site = new Array();
    	           /**
    	            * This gives an array of urls \t tfscores for this query_word.
    	            */
    	        relevant_scores_per_site = tfCount[i].split("\v");    
    	        for(var j in relevant_scores_per_site){
    	           var duple = new Array();
    	           duple = relevant_scores_per_site[j].split("\t");
    	           if(duple[0] == lookupTable[window._content.document.URL]){
    	               alreadyIndexed = true;
    	           }
    	        }
                if(!alreadyIndexed){
                    idfCount[i]++;          
                    tfCount[i] += lookupTable[window._content.document.URL] + "\t" + (Math.round((myCount[i]*1000000)/count)/1000000).toString() + "\v";
                }
            }
          }
         }
        /**
         * tfCount is now a mapping from search word to string of tf scores and their corresponding documents 
         */
        }
      },
  
  /**
   * This function is called when the Mozilla Firefox browser is closed. It writes the contents
   * of the important javascript arrays to the local file system (C:\tmp).
   */
  close: function() {
  	/**
  	 * Open the storage file for writing and we will write out everything anew.
  	 */
	file.open("w");
	filemap.open("w");
	idf.open("w");
	learn.open("w");
	for(var i in tfCount){
		file.write(i + " " + tfCount[i] + "\n");
	}
	filemap.write(url_count + "\n");
	for(var i = 1; i < (parseInt(url_count) + 1); i++){
	    filemap.write(i + " " + url_map[i] + "\n");
	}
	for(var i in idfCount){
	    idf.write(i + " " + idfCount[i] + "\n");
	}
    for(var i in learned_data){
	    learn.write(i + " " + learned_data[i] + "\n");
	}
	file.close();
	filemap.close();
	idf.close();
	learn.close();
  }
}

/**
 * This function is called when HIRL search is clicked. The user has specified a query.
 * If it is a learned query, we just return the URL corresponding to the learned query.
 * Else, we compute the TFIDF score and return the best match URL. If there is no match, we alert the user.
 */
function hirl_search(aEvent){
    var hirled_page = "";
	var query_element = document.getElementById("hirl-query-box").value;
	/**
	 * In this case, we've learned this query before.
	 */
	if(learned_data[query_element]){
	   hirled_page = learned_data[query_element];    
	}
	else{
       var query_words = new Array();
	   query_words = query_element.split(" ");
	   /**
	    * The scores array maps urls to their tf score for all words in the query.
	    */
	   var scores = new Array();                
	   for(var i in query_words){
	       if(tfCount[query_words[i]]){
	           var relevant_scores_per_site = new Array();
	           /**
	            * This gives an array of urls \t tfscores for this query_word.
	            */
	           relevant_scores_per_site = tfCount[query_words[i]].split("\v");    
	           for(var j in relevant_scores_per_site){
	               var duple = new Array();
	               duple = relevant_scores_per_site[j].split("\t");
   	               if(!scores[duple[0]]){
	                   scores[duple[0]] = 0.0;
	               }
	               var idf_score = (Math.log(url_count / idfCount[query_words[i]]) / Math.log(2));
	               scores[duple[0]] += (parseFloat(duple[1]) * idf_score);
	           }
	       }
	   }
	   var highest_score = 0;
	   var target_url = "";
	   for(var i in scores){
	       if(scores[i] > highest_score){
	           highest_score = scores[i];
	           target_url = i;
	       }
	   }
	   hirled_page = url_map[target_url];
	}
    if(hirled_page){
     	window._content.location.href = hirled_page;
    }
    else{
        alert("No pages matched your query. Please try again.");
    }
}

/**
 * This function re-initializes all of the javascript arrays. This way, on page close, we will write empty
 * files. However, learned queries ARE NOT deleted.
 */
function clear_data(aEvent){
    if(confirm("Are you sure you want to delete all saved data, except for learned queries?")){
  	    tfCount = new Array();
  	    idfCount = new Array();
  	    lookupTable = new Array(); //urls to numbers
  	    url_map = new Array();    //numbers to urls
  	    stop_words = new Array();
  	    url_count = 0;
  	    alert("Data will be erased when you close Firefox.");
    }
}

/**
 * This function maps the content of the hirl search box to the current URL.
 */
function learn_query(aEvent){
	//get the query in the text search box
    var query_element = document.getElementById("hirl-query-box");
    //map the user specified query to the current url
    learned_data[query_element.value.toLowerCase()] = window._content.location.toString();	//need toString here because apparently
    																                        //javascript wants to pass a pointer to the location
}

/**
 * ?: match the preceding character 0 or 1 times
 * $: match the end of input
 * [^>]: match anything that is not the character >
 * +: match the preceding character 1 or more times
 */
function parseHTML(inputString){
    var clean_string = "";
	clean_string = inputString.replace(/<\/?[^>]+(>|$)/g, "");
	clean_string = clean_string.replace(/&nbsp/g, "");	
	clean_string = clean_string.replace(/[^A-Za-z\s]/g, "");	
	return clean_string;
}

/**
 * This is called on EVERY keypress inside of the hirl search box, however we are only interested in 
 * the return keypress.
 */
function hirl_keyhandler(event){
	if(event.keyCode == event.DOM_VK_RETURN){
		hirl_search(event);
	}
}

function toggle_learning(event){
    learn_on = !learn_on;
    var out_string = "HIRL learning is now ";
    if(learn_on){
        out_string += "on.";
    }
    else{
        out_string += "off.";
    }
    alert(out_string);
}