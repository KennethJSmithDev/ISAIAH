Class Isaiah.HumanReview Extends Ens.BusinessProcessBPL
{
XData BPL
{
<process request='Isaiah.Request' response='Ens.Response'>
  <context><property name='ReviewAction' type='%String'/></context>
  <sequence>
    <if name='Scope check' condition='##class(Isaiah.ReviewGate).Valid(request)'>
      <true>
        <call name='Create review task' target='IsaiahReviewers' async='1'>
          <request type='EnsLib.Workflow.TaskRequest'>
            <assign property='callrequest.%Actions' value='"Reviewed,NeedsMoreEvidence"' action='set'/>
            <assign property='callrequest.%Subject' value='"ISAIAH synthetic R29 review "_request.RunId' action='set'/>
            <assign property='callrequest.%Message' value='"Review destination availability. The agent result has not necessarily been verified. This task does not authorize a production change. Evidence: trace:R29, receipts:R29."' action='set'/>
          </request>
          <response type='EnsLib.Workflow.TaskResponse'>
            <assign property='context.ReviewAction' value='callresponse.%Action' action='set'/>
          </response>
        </call>
        <sync name='Wait for review' calls='Create review task' type='all'/>
      </true>
    </if>
  </sequence>
</process>
}
}
