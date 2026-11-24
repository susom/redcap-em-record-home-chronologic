<?php
namespace Stanford\ChronologicalInstanceView;

require_once "emLoggerTrait.php";

use REDCap;

class ChronologicalInstanceView extends \ExternalModules\AbstractExternalModule {
    use emLoggerTrait;
  private $project;
  private $projectId;
  private $recordId;

  const INSTANCE_DESC = '@INSTANCESUMMARY';
  const INSTANCE_LABEL = '@INSTANCELABEL';
  const INSTANCE_FILTER = '@INSTANCESUMMARY_FILTER';
  const INSTANCE_ORDER = '@INSTANCEORDER';


  const PRINCIPAL_DATE = '@PRINCIPAL_DATE';
  const ACTION_TAG = '@INSTANCETABLE';
  const ACTION_TAG_REF = '@INSTANCETABLE_REF';

  public function redcap_every_page_top($project_id) {
    if (PAGE == 'DataEntry/record_home.php' && isset($_GET['id']) && !empty($project_id)) {
      // Set up here, not in a constructor: the module class is instantiated on many pages
      // (e.g. to draw its left-menu links), and only Record Home needs the project.
      $this->projectId = $project_id;
      $this->project = new \Project($project_id);
      // Use the record this page shows, read the way REDCap's Record Home reads it
      // (DataEntry::renderRecordHomePage, plus the double-data-entry suffix). Never reduce it to its
      // digits: "ABC" became "", and REDCap::getData() with an empty record loads the WHOLE project.
      $recordId = is_string($_GET['id']) ? addDDEending(strip_tags(label_decode($_GET['id']))) : '';
      if (trim($recordId) === '') {
        return;
      }
      $this->recordId = $recordId;
      //Loop through instruments data dictionary to get tagged fields
      $tableModel = $this->buildChronologicalTableModel();
      $tableData = $this->populateChronologicalTableData($tableModel);
      // No repeating data: render nothing (there is no repeating-forms section to attach to)
      if (!empty($tableData)) {
        $this->showChronologicalPatientTable($tableData);
      }
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
        /* keep dates on one line (they wrapped at the hyphen on phones) */
        #patient_record_table .chrontable-date { white-space: nowrap; }
    </style>
    <script type="text/javascript">

      function format ( d ) {
        // `d` is the original data object for the row
        if (d.children != null) {
          // 5% indent + 95% width: at 100% the child rows overflowed the table (and the page)
          let dtable = '<table cellpadding="5" cellspacing="0" border="0" style="margin-left:5%;width:95%;">' +
            '<tbody>';
          for (let i=0; i< d.children.length; i++) {
            if (d.children[i]['instance_date'] != null) {
              dtable += '<tr><td class="chrontable-date" style="width:10%;"><a href="' + d.children[i].record_url + '">' + d.children[i]
                .instance_date+'</a></td>';
            } else {
              dtable += '<tr><td class="chrontable-date" style="width:10%;"><a href="' + d.children[i].record_url + '">' + d.children[i]
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
        if (!repeatingFormsDiv) return;
        var tableDivLabel = document.createElement("div");
        tableDivLabel.id='chrontable_display_name';
        tableDivLabel.innerHTML="Chronological Patient Record ";
        repeatingFormsDiv.parentNode.insertBefore(tableDivLabel, repeatingFormsDiv);
        var tableDiv = document.createElement("div");
        repeatingFormsDiv.parentNode.insertBefore(tableDiv, repeatingFormsDiv);

        tableDiv.innerHTML='<table id="patient_record_table" class="table table-bordered ' +
          'table-condensed patient_record_table" cellspacing="0" style="width:100%;">' +
          '<thead><tr><th style="width:5%;"><button class="ml-2 btn" id="toggleAllButton" ' +
        '></button></th><th style="width:10%;' +
          '">Date</th><th style="width:20%;">Type</th><th>Summary</th></tr></thead>' +
          '<tbody></tbody></table>';

        var table = $('#patient_record_table').DataTable( {
          // Escaped once here: DataTables and format() insert these strings as HTML.
          // (Static call: this module has no framework-version, and framework v1 does not
          // forward $this->escape().)
          "data":<?php echo json_encode(\ExternalModules\ExternalModules::escape($tableData), JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT)?>,
          "columns": [
            {
              "orderable":      false,
              "data":           null,
              "defaultContent": ''
            },
            { "className": "chrontable-date",
              "data": function (data, type, dataToSet) {
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
          if (!isset($tableModel[$form])) {
            $tableModel[$form] = array();
          }
          if (preg_match("/".self::PRINCIPAL_DATE."/",
            $fieldDetails['field_annotation'])) {
            // assign the instance date
            $tableModel[$form]['instance_date'] = $fieldName;
          }
          if (preg_match("/".self::INSTANCE_DESC."/",
            $fieldDetails['field_annotation'])) {
            // assign the instance description meta
            $tableModel[$form]['instance_desc'][$fieldName] = $fieldDetails;
          }
          if (preg_match("/".self::INSTANCE_LABEL."/",
              $fieldDetails['field_annotation'])) {
              // assign the instance description meta
              $tableModel[$form]['instance_label'][$fieldName] = $fieldDetails;
          }
          if (preg_match("/".self::INSTANCE_FILTER."/",
              $fieldDetails['field_annotation'])) {
              preg_match("/".self::INSTANCE_FILTER."='?\"?(\w+)'?\"?\s?/",
                  $fieldDetails['field_annotation'], $matches);
              $this->emDebug('instance_filter', $matches);
              $tableModel[$form]['instance_filter']['field_name']=$fieldName;
              $tableModel[$form]['instance_filter']['value']=array_pop($matches);
          }
            if (preg_match("/".self::INSTANCE_ORDER."/",
                $fieldDetails['field_annotation'])) {
                preg_match("/".self::INSTANCE_ORDER."='?\"?(\w+)'?\"?\s?/",
                    $fieldDetails['field_annotation'], $matches);
                $this->emDebug('instance_order', $matches);
                $tableModel[$form]['instance_order']=array_pop($matches);
            }
          if ($fieldDetails['field_type']==='descriptive' &&
            preg_match("/".self::ACTION_TAG."='?((\w+_arm_\d+[a-z]?:)?\w+)'?\s?/",
              $fieldDetails['field_annotation'], $matches)
            && preg_match("/".self::ACTION_TAG_REF."='?((\w+_arm_\d+[a-z]?:)?\w+)'?\s?/",
              $fieldDetails['field_annotation'], $matches2)) {
            // $matches is the child form name; $matches2 is the parent instance var

            // assign the parent instance in both parent and child
            if (!isset($tableModel[$form]['children'])) {
              $tableModel[$form]['children'] = array();
            }
            $childFormName = array_pop($matches);
            $parentInstanceVar = array_pop($matches2);
            $tableModel[$form]['children'][$childFormName] = $parentInstanceVar;

            // assume there is only one parent for child
            if (!isset($tableModel[$childFormName])) {
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
    $this->emDebug('Table model', $tableModel);
    return $tableModel;

  }

  /**
   * The fields populateChronologicalTableData() reads: the record ID, every tagged field, the
   * parent-instance fields, and each form's status field, so every repeating form still returns
   * its instances when none of its fields are tagged (those rows use the default description).
   * REDCap stores <form>_complete whenever an instance is saved or imported (0 when not given), so
   * only data written straight to the data table, bypassing REDCap, could lack it.
   * @param $tableModel
   * @return array
   */
  private function getTableFields($tableModel) {
    $fields = array(REDCap::getRecordIdField());
    foreach (array_keys(REDCap::getInstrumentNames()) as $formName) {
      $fields[] = $formName . '_complete';
    }
    foreach ($tableModel as $formModel) {
      if (!empty($formModel['instance_date'])) {
        $fields[] = $formModel['instance_date'];
      }
      foreach (array('instance_desc', 'instance_label') as $key) {
        if (!empty($formModel[$key])) {
          $fields = array_merge($fields, array_keys($formModel[$key]));
        }
      }
      if (!empty($formModel['instance_filter']['field_name'])) {
        $fields[] = $formModel['instance_filter']['field_name'];
      }
      if (!empty($formModel['parent_instance'])) {
        $fields[] = $formModel['parent_instance'];
      }
    }
    // Keep real field names only (an @INSTANCETABLE_REF can carry an event prefix).
    return array_values(array_intersect(array_unique($fields), REDCap::getFieldNames()));
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

    //Get this record's data (only the fields the table uses) and sort it according to chronological view.
    //Pass the record as an array: REDCap::getData() treats an empty record as ALL records.
    $tableData = array();
    $recordData = REDCap::getData(array(
      'project_id' => $this->projectId,
      'return_format' => 'array',
      'records' => array($recordId),
      'fields' => $this->getTableFields($tableModel),
    ));

    // loops through all the events in the record
      $this->emDebug('repeat instances: ' . (empty($recordData[$recordId]['repeat_instances']) ? 'none' : count($recordData[$recordId]['repeat_instances']) . ' event(s)'));
      if (!empty($recordData[$recordId]['repeat_instances'])) {
          foreach ($recordData[$recordId]['repeat_instances'] as $eventId => $form) {
              //print_dump($recordData[$recordId]['repeat_instances'][$eventId]);

              //loop through all the forms in the event
              foreach ($form as $formName => $formData) {
                  $this->emDebug('Form ' . $formName . ': ' . count($formData) . ' instance(s)');
                  $formModel = $tableModel[$formName] ?? array();

                  // loop through parent forms -- do we want to require an instance date for parent forms or not?
                  $parents=[];
                  if (!isset($formModel['parent_form'])) {
                      //&& isset($tableModel[$formName]['instance_date'])) {
                      foreach ($formData as $instanceId => $instanceData) {

                          $parentRecord = $this->getChronRecord($formName, $instanceData, $instanceId, $eventId,
                              $formModel, $recordId);
                          // @INSTANCESUMMARY_FILTER excluded this instance (as it does for children)
                          if ($parentRecord === null) {
                              continue;
                          }

                          // get the children; we assume only one level of children
                          if (!empty($formModel['children'])) {
                              //print_dump($tableModel[$form_name]['children']);
                              $parentRecord['children'] = array();
                              foreach ($formModel['children'] as $childFormName => $parentInstanceVar) {
                                  $children=[];
                                  if (!empty($recordData[$recordId]['repeat_instances'][$eventId][$childFormName])) {
                                      $childData = $recordData[$recordId]['repeat_instances'][$eventId][$childFormName];
                                      foreach ($childData as $childInstanceId => $childInstanceData) {
                                          if ($instanceId == ($childInstanceData[$parentInstanceVar] ?? null)) {
                                            $childRecord = $this->getChronRecord($childFormName, $childInstanceData, $childInstanceId, $eventId,
                                                $tableModel[$childFormName] ?? array(), $recordId);
                                            if ($childRecord !== null) {
                                                $children[] =$childRecord;
                                            }

                                          }

                                      }
                                  }
                                  // sort the children
                                  usort($children, array($this, "recordCmp"));
                                  $childOrder = $tableModel[$childFormName]['instance_order'] ?? null;
                                  $this->emDebug("children of $formName: " . count($children) . ", $childFormName instance_order: " . $childOrder);

                                  if (isset($childOrder)
                                      && stripos($childOrder, 'desc')!==false) {
                                      $children=array_reverse($children);
                                  }
                                  $parentRecord['children'] =array_merge($parentRecord['children'], $children);
                              }
                              // sort the children
                              //usort($parentRecord['children'], array($this, "recordCmp"));
                          }
                          $parents[] = $parentRecord;
                      }
                  }
                  // sort the tableData
                  usort($parents, array($this, "recordCmp"));
                  $parentOrder = $formModel['instance_order'] ?? null;
                  $this->emDebug("rows for $formName: " . count($parents) . ", instance_order: " . $parentOrder);

                  if (isset($parentOrder)
                      && stripos($parentOrder, 'desc')!==false) {
                      $parents= array_reverse($parents);

                  }
                  $tableData = array_merge($tableData, $parents);
              }//end foreach form
          }// end foreach event
      }
      return $tableData;
  }

  private function recordCmp($record1, $record2) {
    if (($record1['instance_date'] ?? null) && ($record2['instance_date'] ?? null)) {
      if ($record1['instance_date'] === $record2['instance_date']) return 0;
      return ($record1['instance_date'] < $record2['instance_date']) ? -1 : 1;
    }

    if (isset($record1['instance_date'])) {
      return -1;
    }
    if (isset($record2['instance_date'])) {
      return 1;
    }
    if (($record1['instance_id'] ?? null) && ($record2['instance_id'] ?? null)) {
      if ($record1['instance_id'] === $record2['instance_id']) return 0;
      return ($record1['instance_id'] < $record2['instance_id']) ? -1 : 1;
    }
    return 0;
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
    if (isset($formModel['instance_filter'])) {
      // field name and filter value only: never log record values
      $this->emDebug('getChronRecord filter field='.$formModel['instance_filter']['field_name']
          .' filter val='. $formModel['instance_filter']['value']);
      if (($instanceData[$formModel['instance_filter']['field_name']] ?? null) !=
          $formModel['instance_filter']['value']) {
        return null;
      }
    }
    $record = array();
    $record['form'] = $formName;
    $record['instance_id'] = $instanceId;
    if (!empty($formModel['instance_date'])) {
      $record['instance_date'] =
        $instanceData[$formModel['instance_date']] ?? null;
    } else if (!empty($formModel['instance_label'])) {
        $record['instance_id'] = $this->getInstanceDataDescription($instanceData,
            $formModel['instance_label']);
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
        $value = $instanceData[$fieldName] ?? '';
        if ($value !== '') {
          if ($fieldMeta['select_choices_or_calculations'] !== '') {
            $options = explode(' | ', $fieldMeta['select_choices_or_calculations']);
            foreach ($options as $option) {
              $keyvalue = explode(', ', $option);
              if ($fieldMeta['field_type'] == 'checkbox') {
                foreach ((is_array($value) ? $value : array()) as $k => $v) {
                  //checkbox is checked
                  if ($keyvalue[0] == $k && $v == "1") {
                    $desc[]= $this->plainLabel($keyvalue[1] ?? '');
                    break;
                  }
                }
              } else if ($value === $keyvalue[0]) {
                $desc[] = $this->plainLabel($keyvalue[1] ?? '');
              }
            }
          } else {
            $desc[] = $value;
          }
      }
    }
    return implode(', ', $desc);
  }

  /**
   * A choice label as plain text. Labels may hold HTML formatting and entities; the table shows
   * text (every value is escaped before rendering), so drop the tags and decode the entities.
   * @param string $label
   * @return string
   */
  private function plainLabel($label) {
    return strip_tags(label_decode($label));
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
    // The record name is user data (letters, spaces, ...): URL-encode every parameter.
    $params = array('pid' => $this->projectId, 'id' => $instanceId, 'event_id' => $eventId, 'page' => $formName);
    if ($parentId !== null && $parentId !== '') {
      $params['id'] = $parentId;
      $params['instance'] = $instanceId;
    }
    return APP_PATH_WEBROOT . "DataEntry/index.php?" . http_build_query($params, '', '&', PHP_QUERY_RFC3986);

  }


}
