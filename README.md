# redcap-em-record-home-chronologic
A summary view of all data in a record on the record home page shown in chronological order

This module sorts and displays repeating forms in a record.  If available, the @PRINCIPAL_DATE tag is used to
 identify the date on which the record should be sorted, otherwise the record id is used.  The @INSTANCESUMMARY
  action tag is used to identify fields displayed in the "Summary" column of the Chronological View table.  The table
   is displayed on the record home page.    

This module works with the Instance Table External Module to display repeating forms with action tags
 @INSTANCETABLE and @INSTANCETABLE_REF as children and parent
 records, respectively.  Children records are displayed as subtables in the Chronological View Table and can be
  collapsed or expanded.  
