<?php
namespace Stanford\ChronologicalInstanceView;

ini_set("memory_limit", "-1");
ini_set('max_execution_time', 0);
set_time_limit(0);

use REDCap;

class ChronologicalInstanceView extends \ExternalModules\AbstractExternalModule {
  private $project;
  private $projectId;
  private $recordId;

  const INSTANCE_DESC = '@INSTANCESUMMARY';
  const PRINCIPAL_DATE = '@PRINCIPAL_DATE';
  const ACTION_TAG = '@INSTANCETABLE';
  const ACTION_TAG_REF = '@INSTANCETABLE_REF';

  public function __construct()
  {
    try {
      parent::__construct();

      if (isset($_GET['pid']) || isset($_POST['pid'])) {
        if (isset($_GET['pid'])) {
          $projectId = filter_var($_GET['pid'], FILTER_SANITIZE_NUMBER_INT);
        } elseif (isset($_POST['pid'])) {
          $projectId = filter_var($_POST['pid'], FILTER_SANITIZE_NUMBER_INT);
        }
        $this->projectId = $projectId;
        $this->project = new \Project($this->getProjectId());
      }
    } catch (\Exception $exception) {
      echo $exception->getMessage();
    } catch (\LogicException $exception) {
      echo $exception->getMessage();
    }
  }

  public function redcap_every_page_top($project_id) {
    if (PAGE == 'DataEntry/record_home.php' && isset($_GET['id'])) {
      $this->recordId = filter_var($_GET['id'], FILTER_SANITIZE_NUMBER_INT);
      //Loop through instruments data dictionary to get tagged fields
      $tableModel = $this->buildChronologicalTableModel();
      $tableData = $this->populateChronologicalTableData($tableModel);
      $this->showChronologicalPatientTable($tableData);
    }
  }

  private function showChronologicalPatientTable($tableData) {
    // build the display table
    ?>
    <style type="text/css">
        td.details-control {
            background: url('../Resources/images/toggle-expand.png') no-repeat center center;
            cursor: pointer;
        }
        tr.shown td.details-control {
            background: url('../Resources/images/toggle-collapse.png') no-repeat center center;
        }
        #toggleAllButton {
            background: url('../Resources/images/toggle-expand.png')  no-repeat;
            cursor: pointer;
            border: none;
            height: 16px;
            width: 16px;
            padding: 0;
        }
        #toggleAllButton.shown {
            background: url('../Resources/images/toggle-collapse.png') no-repeat;
        }
        #chrontable_display_name { margin: 20px 0 10px; padding-bottom: 5px !important;
            text-align:left;font-size:15px;border-bottom:1px dashed #ccc;
            }
        #chrontable_display_name>div { display:inline-block;vertical-align:top; }
    </style>
    <script type="text/javascript">

      function format ( d ) {
        // `d` is the original data object for the row
        if (d.children != null) {
          let dtable = '<table cellpadding="5" cellspacing="0" border="0" style="margin-left:5%;width:100%;">' +
            '<tbody>';
          for (let i=0; i< d.children.length; i++) {
            if (d.children[i]['instance_date'] != null) {
              dtable += '<tr><td style="width:10%;"><a href="' + d.children[i].record_url + '">' + d.children[i]
                .instance_date+'</a></td>';
            } else {
              dtable += '<tr><td style="width:10%;"><a href="' + d.children[i].record_url + '">' + d.children[i]
                .instance_id +'</a></td>';
            }
            dtable += '<td style="width:20%">' +d.children[i].form+'</td>';
            dtable += '<td>' +d.children[i].description+'</td></tr>';
          }
          dtable +='</tbody></table>';
          return dtable;
        } else {
          return null;
        }
      }
      $(document).ready(function() {
        var repeatingFormsDiv = document.getElementById('repeating_forms_table_parent_title');
        var tableDivLabel = document.createElement("div");
        tableDivLabel.id='chrontable_display_name';
        tableDivLabel.innerHTML="Chronological Patient Record <button class='ml-2 btn' id='toggleAllButton' " +
          "></button>";
        repeatingFormsDiv.parentNode.insertBefore(tableDivLabel, repeatingFormsDiv);
        var tableDiv = document.createElement("div");
        repeatingFormsDiv.parentNode.insertBefore(tableDiv, repeatingFormsDiv);

        tableDiv.innerHTML='<table id="patient_record_table" class="table table-bordered ' +
          'table-condensed patient_record_table" cellspacing="0" style="width:100%;">' +
          '<thead><tr><th style="width:5%;"></th><th style="width:10%;' +
          '">Date</th><th style="width:20%;">Type</th><th>Summary</th></tr></thead>' +
          '<tbody></tbody></table>';

        var table = $('#patient_record_table').DataTable( {
          "data":<?php echo json_encode($tableData)?>,
          "columns": [
            {
              "orderable":      false,
              "data":           null,
              "defaultContent": ''
            },
            { "data": function (data, type, dataToSet) {
              if (data.instance_date != null) {
                return '<a href="' + data.record_url + '">' + data.instance_date + '</a>';
              } else {
                return '<a href="' + data.record_url + '">' + data.instance_id + '</a>';
              }
              }
            },
            { "data": "form" },
            { "data": "description" }

          ],
          //"order": [[1, 'asc']], already sorted server side
          "columnDefs": [ {
            "targets": 0,
            "createdCell": function (td, cellData, rowData, row, col) {
              if ( cellData.children != null ) {
                $(td).addClass('details-control');
              }
            }
          } ]
        } );

        // Add event listener for opening and closing details
        $('#patient_record_table tbody').on('click', 'td.details-control', function () {
          var tr = $(this).closest('tr');
          var row = table.row( tr );

          if ( row.child.isShown() ) {
            // This row is already open - close it
            row.child.hide();
            tr.removeClass('shown');
          }
          else {
            // Open this row
            row.child( format(row.data()) ).show();
            tr.addClass('shown');
          }
        } );

        // Handle click on "Expand All" button
        $('#toggleAllButton').on('click', function(){
          $('#patient_record_table tbody td.details-control').each(function() {
            var tr = $(this).closest('tr');
            var row = table.row( tr );
            if ($('#toggleAllButton').hasClass('shown')) {
              if (row.child.isShown()){
                // Collapse row details
                row.child.hide();
                tr.removeClass('shown');
              }
            } else {
              if (!row.child.isShown()) {
                // Open this row
                row.child( format(row.data()) ).show();
                tr.addClass('shown');
              }
            }
            }
          );
          if ($('#toggleAllButton').hasClass('shown')) {
            $('#toggleAllButton').removeClass('shown');
          } else {
            $('#toggleAllButton').addClass('shown');
          }
        });

      } );

    </script>
    <?php
  }

  /* $tableModel = [ $formName=> {
    'parent_instance' => integer
    'parent_form' => string
    'instance_desc' => [
      $fieldName = {
        'field_name' => string
        'form_name' => string
        'field_type' = ['text',']
        'select_choices_or_calculations' => string
        'field_annotation' => '@INSTANCE_SUMMARY'
      }]
  ]} */
  /**
   * @return array
   */
  private function buildChronologicalTableModel() {
    $tableModel = array();
    $eventForms = $this->project->eventsForms;
    $eventIds = array_keys($this->project->eventInfo);
    foreach ($eventIds as $eventId) {
      $forms = $eventForms[$eventId];

      // Loop through forms to build $chronView
      // Looking for @PRINCIPAL_DATE,@INSTANCETABLE,@INSTANCETABLE_REF in parent forms
      // Looking for @FORMINSTANCE in child forms
      // @INSTANCE_SUMMARY in all display forms
      foreach ($forms as $formIndex=>$form) {
        $instrumentFields = REDCap::getDataDictionary('array', false, true, $form);
        foreach ($instrumentFields as $fieldName => $fieldDetails) {
          $matches = array();
          $matches2 = array();
          if ($tableModel[$form]==null) {
            $tableModel[$form] = array();
          }
          if (preg_match("/".self::PRINCIPAL_DATE."/",
            $fieldDetails['field_annotation'])) {
            // assign the instance date
            $tableModel[$form]['instance_date'] = $fieldName;
          } else if (preg_match("/".self::INSTANCE_DESC."/",
            $fieldDetails['field_annotation'])) {
            // assign the instance description meta
            $tableModel[$form]['instance_desc'][$fieldName] = $fieldDetails;
          } else if ($fieldDetails['field_type']==='descriptive' &&
            preg_match("/".self::ACTION_TAG."='?((\w+_arm_\d+[a-z]?:)?\w+)'?\s?/",
              $fieldDetails['field_annotation'], $matches)
            && preg_match("/".self::ACTION_TAG_REF."='?((\w+_arm_\d+[a-z]?:)?\w+)'?\s?/",
              $fieldDetails['field_annotation'], $matches2)) {
            // $matches is the child form name; $matches2 is the parent instance var

            // assign the parent instance in both parent and child
            if ($tableModel[$form]['children'] == null) {
              $tableModel[$form]['children'] = array();
            }
            $childFormName = array_pop($matches);
            $parentInstanceVar = array_pop($matches2);
            $tableModel[$form]['children'][$childFormName] = $parentInstanceVar;

            // assume there is only one parent for child
            if ($tableModel[$childFormName] == null) {
              $tableModel[$childFormName] = array();
            }
            $tableModel[$childFormName]['parent_instance'] = $parentInstanceVar;
            $tableModel[$childFormName]['parent_form'] = $form;
          } /*else if (preg_match("/".self::FORMINSTANCE."='?((\w+_arm_\d+[a-z]?:)?\w+)'?\s?/",
              $fieldDetails['field_annotation'], $matches)) {
              // assign the child's parent
              $tableModel[$form]['parent_form'] = array_pop($matches);
            }*/
        }
      }
    }
    emDebug('Table model: '. print_r($tableModel, true));
    return $tableModel;

  }

  /* @param $tableModel
   * @return array */
  /* $tableData = [
     {'form' => string
      'instance_id' => string
      'instance_date' => string
      'description' => string
      'record_url' => string
      'children => [
         {'form' => string
          'instance_id' =>string
          'instance_date' => string
          'description' => string
          'record_url' => string }]
      }]
  */
  private function populateChronologicalTableData($tableModel) {
    $recordId = $this->recordId;

    //Get all the data that belongs to this record and sort it according to chronological view
    $tableData = array();
    $recordData = REDCap::getData('array', $recordId);

    // loops through all the events in the record
    foreach ($recordData[$recordId]['repeat_instances'] as $eventId => $form) {
      //print_dump($recordData[$recordId]['repeat_instances'][$eventId]);

      //loop through all the forms in the event
      foreach ($form as $formName => $formData) {
        emDebug('Form data ' . $formName . ': ' . print_r($formData, true));

        // loop through parent forms -- do we want to require an instance date for parent forms or not?
        if (!isset($tableModel[$formName]['parent_form'])) {
          //&& isset($tableModel[$formName]['instance_date'])) {
          foreach ($formData as $instanceId => $instanceData) {
            //print_dump($instanceData);
            //print_dump($tableModel[$formName]);

            $parentRecord = $this->getChronRecord($formName, $instanceData, $instanceId, $eventId,
              $tableModel[$formName], $recordId);
            //print_dump($parentRecord);

            // get the children; we assume only one level of children
            if ($tableModel[$formName]['children']) {
              //print_dump($tableModel[$form_name]['children']);
              $parentRecord['children'] = array();
              foreach ($tableModel[$formName]['children'] as $childFormName => $parentInstanceVar) {
                if ($recordData[$recordId]['repeat_instances'][$eventId][$childFormName]) {
                  $childData = $recordData[$recordId]['repeat_instances'][$eventId][$childFormName];
                  foreach ($childData as $childInstanceId => $childInstanceData) {
                    if ($instanceId == $childInstanceData[$parentInstanceVar])
                      $parentRecord['children'][]=
                        $this->getChronRecord($childFormName, $childInstanceData, $childInstanceId, $eventId,
                          $tableModel[$childFormName], $recordId);
                  }
                }
              }
              // sort the children
              usort($parentRecord['children'], array($this, "recordCmp"));
            }
            $tableData[]=$parentRecord;
          }
        }
      }//end foreach form
    }// end foreach event
    // sort the tableData
    usort($tableData, array($this, "recordCmp"));
    return $tableData;
  }

  private function recordCmp($record1, $record2) {
    if ($record1['instance_date'] && $record2['instance_date']) {
      if ($record1['instance_date'] === $record2['instance_date']) return 0;
      return ($record1['instance_date'] < $record2['instance_date']) ? -1 : 1;
    }

    if (isset($record1['instance_date'])) {
      return -1;
    }
    if (isset($record2['instance_date'])) {
      return 1;
    }
    if ($record1['instance_id'] && $record2['instance_id']) {
      if ($record1['instance_id'] === $record2['instance_id']) return 0;
      return ($record1['instance_id'] < $record2['instance_id']) ? -1 : 1;
    }
  }

  /**
   * @param $formName
   * @param $instanceData
   * @param $instanceId
   * @param $eventId
   * @param $formModel
   * @param null $parentId
   * @return array
   */
  private function getChronRecord($formName, $instanceData, $instanceId, $eventId, $formModel, $parentId = null) {
    $record = array();
    $record['form'] = $formName;
    $record['instance_id'] = $instanceId;
    if ($formModel['instance_date']) {
      $record['instance_date'] =
        $instanceData[$formModel['instance_date']];
    }
    if (!empty($formModel['instance_desc'])) {
      $record['description'] = $this->getInstanceDataDescription($instanceData,
        $formModel['instance_desc']);
    } else {
      $record['description'] = strtoupper($formName)  . ': ' .
        ((isset($record['instance_date'])) ? $record['instance_date'] : $record['instance_id'])
       ;
    }
    $record['record_url'] = $this->getRecordURL($instanceId, $eventId, $formName, $parentId);
    //print_dump($record);
    return $record;
  }

/**
 * @param $instanceData
 * @param $formModel
 * @return string
 * */
  private function getInstanceDataDescription($instanceData, $formModel) {
    // translate form data into user readable format
    $desc = array();
      foreach ($formModel as $fieldName => $fieldMeta) {
        if ($instanceData[$fieldName] !== '') {
          if ($fieldMeta['select_choices_or_calculations'] !== '') {
            $options = explode(' | ', $fieldMeta['select_choices_or_calculations']);
            foreach ($options as $option) {
              $keyvalue = explode(', ', $option);
              if ($fieldMeta['field_type'] == 'checkbox') {
                foreach ($instanceData[$fieldName] as $k => $v) {
                  //checkbox is checked
                  if ($keyvalue[0] == $k && $v == "1") {
                    $desc[]= $keyvalue[1];
                    break;
                  }
                }
              } else if ($instanceData[$fieldName] === $keyvalue[0]) {
                $desc[] = $keyvalue[1];
              }
            }
          } else {
            $desc[] = $instanceData[$fieldName];
          }
      }
    }
    return implode(', ', $desc);
  }

  /**
   * @param $instanceId
   * @param $eventId
   * @param $formName
   * @param null $parentId
   * @return string
   * */
  private function getRecordURL($instanceId, $eventId, $formName, $parentId = null)
  {
    $projectId = $this->projectId;
    if ($parentId == null) {
      return APP_PATH_WEBROOT . "DataEntry/index.php?pid=$projectId&id=$instanceId&event_id=$eventId&page=$formName";
    } else {
      return APP_PATH_WEBROOT . "DataEntry/index.php?pid=$projectId&id=$parentId&event_id=$eventId&page=$formName&instance=$instanceId";
    }

  }


}
