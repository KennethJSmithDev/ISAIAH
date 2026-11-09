Class IsaiahTest.Production Extends Ens.Production
{
XData ProductionDefinition
{
<Production Name="IsaiahTest.Production" TestingEnabled="false" LogGeneralTraceEvents="false">
  <Description>Synthetic delivery routing and a scoped investigation.</Description>
  <ActorPoolSize>2</ActorPoolSize>
  <Item Name="Intake" ClassName="Isaiah.Intake" PoolSize="0" Enabled="true"/>
  <Item Name="Router" ClassName="Isaiah.Router" PoolSize="1" Enabled="true"/>
  <Item Name="Express" ClassName="Isaiah.Destination" PoolSize="1" Enabled="true">
    <Setting Target="Host" Name="Destination">Express</Setting>
  </Item>
  <Item Name="Standard" ClassName="Isaiah.Destination" PoolSize="1" Enabled="true">
    <Setting Target="Host" Name="Destination">Standard</Setting>
  </Item>
  <Item Name="Investigation" ClassName="Isaiah.Investigation" PoolSize="1" Enabled="true"/>
  <Item Name="Agent" ClassName="IsaiahTest.FixtureAgent" PoolSize="1" Enabled="true"/>
  <Item Name="Diagnostic" ClassName="Isaiah.Branch" PoolSize="1" Enabled="true">
    <Setting Target="Host" Name="Mode">diagnostic</Setting>
  </Item>
  <Item Name="Review" ClassName="Isaiah.Branch" PoolSize="1" Enabled="true">
    <Setting Target="Host" Name="Mode">review</Setting>
  </Item>
  <Item Name="HumanReview" ClassName="Isaiah.HumanReview" PoolSize="1" Enabled="true"/>
  <Item Name="IsaiahReviewers" ClassName="EnsLib.Workflow.Operation" PoolSize="1" Enabled="true">
    <Setting Target="Host" Name="AutoCreateRole">1</Setting>
  </Item>
  <Item Name="ReviewOutbox" ClassName="Isaiah.ReviewOutbox" PoolSize="1" Enabled="true"/>
</Production>
}
}
