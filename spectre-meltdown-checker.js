#include "common/mysql_helper.js"
#include "cmon/io.h"

var DESCRIPTION="Checks on Meltdown/Spectre CVE's of the MySQL Nodes";
var TITLE="Meltdown/Spectre Check";
var ADVICE_WARNING="Please upgrade your kernel";
var ADVICE_OK="Kernel is not affected by Meltdown/Spectre." ;

/**
 * 
 * @title  String    Title of the alarm
 * @message String   Message for the alarm
 * @recommendation String  Recommendation for this alarm.
 * @return Returns the alarm which we can use to set the alarm to raise
 */
function myAlarm(title, message, recommendation)
{
  return Alarm::alarmId(
        Node,
	  	true,
        title,
        message,
        recommendation
  );
}

function main()
{
    var hosts     = cluster::mySqlNodes();
    var advisorMap = {};

    var examinedHostnames = "";
    for (idx = 0; idx < hosts.size(); ++idx)
    {
        host        = hosts[idx];
        if (!host.connected())
            continue;

        if (examinedHostnames.contains(host.hostName()))
            continue;
        examinedHostnames += host.hostName();
        print("   ");
        print(host.hostName());
        print("==========================");
        map         = host.toMap();
        var advice = new CmonAdvice();
		
	    var shell = "test -e /usr/bin/spectre-meltdown-checker.sh";	    
        var retval = host.system(shell);
        var reply = retval["result"];
		
        var msg = "";
		var myAlarmId = {};
        
        if (!retval["success"]) { //shell script is not installed properly.
            if (reply.empty())  {
                msg  = "<br />Empty reply from the command. It looks like you have not "
                       "setup the shell script yet. You can get the shell script from "
                       "https://meltdown.ovh"
                       "<br /> or run &quot;sudo wget https://meltdown.ovh -O /usr/bin/spectre-meltdown-checker.sh;"
                       " sudo chmod +x /usr/bin/spectre-meltdown-checker.sh&quot;";
                advice.setSeverity(Warning);
                advice.setJustification(msg);
                advice.setAdvice("Script Setup/Installation required!");
                
            } else {
                msg = "Check why the command failed: " + retval["errorMessage"];
                advice.setSeverity(Warning);
                advice.setJustification("Command failed.");
                advice.setAdvice("Check why the command failed: " +
                                  retval["errorMessage"]);
            }
        } else {
			
			var dateTime = CmonDateTime::currentDateTime();
			var dateToday = dateTime.toString(ShortDateFormat);
			dateToday = dateToday.replace("/", "-");
			var todayLogFile = "/tmp/spectre-meltdown" + "_" + dateToday + ".log";
			
    		shell = "test -e " + todayLogFile; // if /tmp/spectre-metldown_m.yy.dd.log exist.
			retval = host.system(shell);
			
    		shell = "wc -l " + todayLogFile + "|awk -F ' ' '{print $1}'|tr -d '\n'"; // check if the file has contents
			var retvalLogContents = host.system(shell);
	        replyLogContents = retvalLogContents["result"];
			
            if (! retval["success"]) {
				
				// Let's generate result if command fails and log do not exist.
                shell = "sudo nohup /usr/bin/spectre-meltdown-checker.sh --batch json > " + todayLogFile;
		        retval = host.system(shell);
		        reply = retval["result"];
		        var jsonMetldownCheckerReply = JSON::parse(reply.toString());
				var errTimeoutMsg = "ssh timeout: Execution timeout";
				
				
				print(shell);				
				print ("retval" + retval);
				print("jsonMetldownCheckerReply " + retval);

	            if (! retval["success"] && retval["errorMessage"].indexOf(errTimeoutMsg, 0) == -1) {
	                msg  = "<br />Command to generate report from /usr/bin/spectre-meltdown-checker.sh failed. Please check the result.";
	                advice.setSeverity(Ok);
	                advice.setJustification(msg);
	                advice.setAdvice("Nothing to do.");
        
				} else {
	                msg  = "<br />Report has been generated as of this time. Please check after a minute to grab the results.";
	                advice.setSeverity(Ok);
	                advice.setJustification(msg);
	                advice.setAdvice("Nothing to do.");
				}
            } else { // start reading report.		
		
		        if (! retvalLogContents["success"] || ! replyLogContents.toInt()) {
		            if (! reply.toInt()) {
		                msg  = "<br />No result generated as of this time. Check after a minute.";
		                advice.setSeverity(Ok);
		                advice.setJustification(msg);
		                advice.setAdvice("Nothing to do.");
            
		            } else {
		                msg = "Check why the command failed: " + retval["errorMessage"];
		                advice.setSeverity(Warning);
		                advice.setJustification("Command failed.");
		                advice.setAdvice("Check why the command failed: " +
		                                  retval["errorMessage"]);
		            }
		        } else {
		            shell = "cat " + todayLogFile + " | tr -d '\n'";
			        retval = host.system(shell);
			        reply = retval["result"];
					jsonStr = '{"list":' + reply.toString() + '}';
			        mapSpectreMeltdownResult = JSON::parse(jsonStr);
					
					for (ndex=0; ndex < mapSpectreMeltdownResult["list"].size(); ndex++) {
					    if (mapSpectreMeltdownResult["list"][ndex]["VULNERABLE"]) {
			                msg  += "<br />Host is affected by " 
								 + mapSpectreMeltdownResult["list"][ndex]["CVE"] + "/"
								 + mapSpectreMeltdownResult["list"][ndex]["NAME"] + ". "
								 + "Suggested action: &quot;" + mapSpectreMeltdownResult["list"][ndex]["INFOS"] + "&quot;";
							
			            } 
					}
					
		            if (msg.length()) {
						var recommendation = "We advise to update your kernel to the latest version "
									 		 "or check your Linux Distro and see the recent updates about this CVE.";
		                advice.setSeverity(Warning);
		                advice.setJustification(msg);
		                advice.setAdvice(recommendation);
        
			             myAlarmId = myAlarm("Metldown/Spectre Affected!", msg, recommendation);
						 // Let's raise an alarm.
                         host.raiseAlarm(myAlarmId, Warning);
		            } else {
		                advice.setSeverity(Ok);
		                advice.setJustification(
							"Kernel is not affected by CVE-2017-5753/CVE-2017-5715/CVE-2017-5754/CVE-2018-3640/"
							"CVE-2018-3639/CVE-2018-3615/CVE-2018-3620/CVE-2018-3646"
						);
		                advice.setAdvice(ADVICE_OK);
		            }
		        }				
            	
            } // end
			
        }
        advice.setHost(host);
        advice.setTitle(TITLE);
        advisorMap[idx]= advice;
        print(advice.toString("%E"));
        
    }
    return advisorMap;
}
