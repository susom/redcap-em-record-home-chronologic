# redcap-em-record-home-chronologic
A summary view of all data in a record on the record home page with child instances sorted and grouped under its 
parent.

This module sorts and displays repeating forms in a record.  This module works with the [Instance Table External 
Module](https://github.com/lsgs/redcap-instance-table) to display repeating forms with action tags **@INSTANCETABLE** 
and **@INSTANCETABLE_REF** as children and parent
records, respectively.  Children records are displayed as subtables in the Chronological View Table and can be
collapsed or expanded.  

###Action Tags

This EM depends heavily on the usage of Action Tags to designate the structure and contents of the summary table.

* __Instance Identifier__
  * The **@PRINCIPAL_DATE** tag from the [Export Repeating Data External Module
](https://github.com/susom/redcap-em-export-repeating-data) is used to
 identify the date on which the record should be sorted.
  *  Otherwise the optional **@INSTANCELABEL** is used.
  * If the 
form does not have a **@PRINCIPAL_DATE** or **@INSTANCELABEL** action tag, then the instance number is used as the 
form id.  


* __Instance Sorting__
    * The **@INSTANCEORDER** tag can be used to indicate whether the default sorting should be ascending 
or descending.  
      * Default **@INSTANCEORDER** is 'ascending'.  
      * To set default order to descending, use 
**@INSTANCEORDER=descending**.


* __Instance Description/Summary__
    * The **@INSTANCESUMMARY**
  action tag is used to identify fields displayed in the "Summary" column of the Chronological View table.  Multiple 
fields can be tagged with this tag.  


* __Instance Filtering__
  * The **@INSTANCESUMMARY_FILTER** tag can be optionally used if there are certain forms that the 
  user does not wish to 
see.
  * The **@INSTANCESUMMARY_FILTER** indicates an equality that needs to evaluate to 'true' for the instance to 
    display in 
the record summary table.   For example, if the field 'status' is tagged with **@INSTANCESUMMARY_FILTER=1**, then only 
instances where the value of status=1 will be displayed in the summary table.  

